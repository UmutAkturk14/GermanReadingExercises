import type { VercelRequest, VercelResponse } from "@vercel/node";
import { PrismaClient } from "@prisma/client";
import openAiModule from "../server/dist/services/openai.js";
import type { GenerationResult, StudyMode } from "../server/src/types/generation.js";
import { enforceJsonContent, rateLimit, verifyAuth } from "./security.js";
import { vocabSchema } from "./validators.js";
import { getUserFromRequest, verifyJWT } from "./auth.js";

const prisma = new PrismaClient();
const { generateQuestions } = openAiModule as typeof import("../server/src/services/openai.js");

const parseJsonBody = (raw: unknown) => {
  if (!raw) return null;
  if (raw instanceof Uint8Array) {
    try {
      return JSON.parse(raw.toString()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") {
    return raw as Record<string, unknown>;
  }
  return null;
};

const persistGeneratedItems = async (
  _mode: StudyMode,
  theme: string,
  level: string,
  topic: string,
  items: GenerationResult,
) => {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const created = [];
  for (const item of items) {
    const record = await prisma.paragraph.create({
      data: {
        title: item.title ?? null,
        theme: item.theme ?? theme,
        topic: item.topic ?? topic,
        level: item.level ?? level,
        content: item.content,
        questions: {
          create: (item.questions ?? []).map((q) => ({
            question: q.question,
            answer: q.answer,
          })),
        },
        importantWords: {
          create: (item.importantWords ?? []).map((w) => ({
            term: w.term,
            meaning: w.meaning,
            usageSentence: w.usageSentence,
          })),
        },
      },
      include: { questions: true, importantWords: true },
    });
    created.push(record);
  }
  return created;
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  const jwtPayload = await verifyJWT(req);
  if (!jwtPayload && !(await verifyAuth(req, res))) return;
  const user = jwtPayload ?? (await getUserFromRequest(req));
  if (!user) {
    res.status(401).json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } });
    return;
  }
  if (user.role !== "admin") {
    res
      .status(403)
      .json({ error: { message: "Admin role required to generate content", code: "FORBIDDEN" } });
    return;
  }
  if (!(await rateLimit(req, res))) return;
  if (req.method === "POST" && !enforceJsonContent(req, res)) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: { message: "Method not allowed", code: "METHOD_NOT_ALLOWED" } });
    return;
  }

  const body = parseJsonBody(req.body);
  const parsed = vocabSchema.safeParse(body);

  if (!parsed.success) {
    res
      .status(400)
      .json({ error: { message: "Invalid payload", code: "BAD_REQUEST" }, details: parsed.error.flatten() });
    return;
  }

  const { mode, theme } = parsed.data;
  const themeValue = theme.trim();
  const levelRaw = typeof body?.level === "string" ? body.level : "";
  const topicRaw = typeof body?.topic === "string" ? body.topic : "";
  const topic = topicRaw.replace(/<[^>]*>?/g, "").trim().slice(0, 120) || themeValue;
  const targetLevel =
    levelRaw && /^A[12]|B[12]|C[12]$/.test(levelRaw) ? levelRaw : "A1";

  try {
    const generated = await generateQuestions(mode, themeValue, targetLevel, topic);
    const allPersisted = await persistGeneratedItems(
      mode,
      themeValue,
      targetLevel,
      topic,
      generated,
    );

    res.status(200).json({
      mode,
      theme: themeValue,
      level: targetLevel,
      topic,
      count: allPersisted.length,
      items: allPersisted,
    });
  } catch (error) {
    console.error("[api/vocab] error", error);
    res.status(500).json({ error: { message: "Internal server error", code: "SERVER_ERROR" } });
  }
}
