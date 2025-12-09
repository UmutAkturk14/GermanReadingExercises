import "dotenv/config";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { createYoga } from "graphql-yoga";
import { PrismaClient, ItemType } from "@prisma/client";
import { schema } from "./graphql/schema";
import type { GraphQLContext } from "./types/context";
import { generateQuestions } from "./services/openai";

const prisma = new PrismaClient();
const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

type JWTPayload = {
  userId: string;
  role: string;
  email: string;
};

const authSecret = process.env.JWT_SECRET ?? "";

const rateLimitBuckets = new Map<string, { count: number; reset: number }>();
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 20;

const getClientIp = (req: express.Request) => {
  const xfwd = req.headers["x-forwarded-for"];
  if (typeof xfwd === "string" && xfwd.length > 0) {
    return xfwd.split(",")[0]!.trim();
  }
  const sock = req.socket;
  return sock.remoteAddress ?? "unknown";
};

const rateLimit = (req: Request, res: Response, next: NextFunction) => {
  const ip = getClientIp(req);
  const now = Date.now();
  const bucket = rateLimitBuckets.get(ip);

  if (!bucket || bucket.reset < now) {
    rateLimitBuckets.set(ip, { count: 1, reset: now + WINDOW_MS });
    next();
    return;
  }

  if (bucket.count >= MAX_REQUESTS) {
    res.setHeader("Retry-After", Math.ceil((bucket.reset - now) / 1000));
    res.status(429).json({ error: "Too many requests. Please slow down." });
    return;
  }

  bucket.count += 1;
  rateLimitBuckets.set(ip, bucket);
  next();
};

const verifyJWT = (authHeader?: string | null): JWTPayload | null => {
  if (!authHeader || typeof authHeader !== "string") return null;
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;
  if (!authSecret) return null;
  try {
    return jwt.verify(token, authSecret) as JWTPayload;
  } catch {
    return null;
  }
};

const requireUser = (req: Request, res: Response, next: NextFunction) => {
  const payload = verifyJWT(req.headers.authorization);
  if (!payload) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as any).user = payload;
  next();
};

const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  const payload = verifyJWT(req.headers.authorization);
  const apiKey =
    typeof req.headers["x-api-key"] === "string"
      ? req.headers["x-api-key"]
      : Array.isArray(req.headers["x-api-key"])
        ? req.headers["x-api-key"][0]
        : null;
  if (!payload && apiKey !== process.env.AUTH_SECRET) {
    res
      .status(401)
      .json({ error: "Unauthorized. Admin token or API key required." });
    return;
  }
  if (payload && payload.role !== "admin") {
    res.status(403).json({ error: "Forbidden: admin role required." });
    return;
  }
  (req as any).user = payload ?? null;
  next();
};

// GraphQL
const yoga = createYoga<{ req: Request; res: Response }, GraphQLContext>({
  schema: schema as any,
  graphqlEndpoint: "/api/graphql",
  context: async ({ request }) => {
    const token = request.headers.get("authorization");
    const jwtPayload = verifyJWT(token);
    const apiKeyAuth =
      request.headers.get("x-api-key") === process.env.AUTH_SECRET;
    const isAuthenticated = Boolean(jwtPayload || apiKeyAuth);
    return {
      prisma,
      isAuthenticated,
      user: jwtPayload ?? null,
    };
  },
});

app.use("/api/graphql", rateLimit, async (req: Request, res: Response) => {
  const response = await yoga.handleNodeRequest(req, {
    req,
    res,
  } as any);
  response.headers.forEach((value, key) => res.setHeader(key, value));
  const text = await response.text();
  res.status(response.status).send(text);
});

// Auth: signup
const signupSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  role: z.enum(["user", "admin"]).optional(),
});

app.post("/api/auth/signup", rateLimit, async (req: Request, res: Response) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }
  const { email, password, role = "user" } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, passwordHash, role },
  });
  res.status(201).json({
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  });
});

// Auth: signin
const signinSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
});

app.post("/api/auth/signin", rateLimit, async (req: Request, res: Response) => {
  const parsed = signinSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }
  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  if (!authSecret) {
    res.status(500).json({ error: "JWT secret not configured" });
    return;
  }
  const token = jwt.sign(
    { userId: user.id, role: user.role, email: user.email },
    authSecret,
    { expiresIn: "7d" }
  );
  res.status(200).json({
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    },
  });
});

// Vocab generation (admin-only)
const vocabSchema = z.object({
  mode: z.literal("reading"),
  theme: z.string().min(1).max(200),
  level: z.string().optional(),
  topic: z.string().optional(),
});

app.post(
  "/api/vocab",
  rateLimit,
  requireAdmin,
  async (req: Request, res: Response) => {
    const parsed = vocabSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { message: "Invalid payload", code: "BAD_REQUEST" },
        details: parsed.error.flatten(),
      });
      return;
    }
    const { mode, theme, level, topic } = parsed.data;
    const themeValue = theme.trim();
    const topicValue = (topic ?? themeValue).trim();
    const levelValue =
      level && /^A[12]|B[12]|C[12]$/.test(level) ? level : "A1";

    try {
      const generated = await generateQuestions(
        mode,
        themeValue,
        levelValue,
        topicValue
      );
      const created = [];
      for (const item of generated) {
        const record = await prisma.paragraph.create({
          data: {
            title: item.title ?? null,
            theme: item.theme ?? themeValue,
            topic: item.topic ?? topicValue,
            level: item.level ?? levelValue,
            content: item.content,
            questions: {
              create: (item.questions ?? []).map((q) => ({
                question: q.question,
                answer: q.answer,
                choices: q.choices ?? [],
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
        });
        created.push(record);
      }

      res.status(200).json({
        mode,
        theme: themeValue,
        level: levelValue,
        topic: topicValue,
        count: created.length,
        items: created,
      });
    } catch (error) {
      console.error("[api/vocab] error", error);
      res.status(500).json({
        error: { message: "Internal server error", code: "SERVER_ERROR" },
      });
    }
  }
);

// Exercise submit (progress per item)
const exerciseSchema = z.object({
  id: z.string().min(1),
  correct: z.boolean().optional(),
  itemType: z.enum(["PARAGRAPH_QUESTION", "IMPORTANT_WORD"]),
});

const calcNextReview = (successStreak: number) => {
  const now = Date.now();
  if (successStreak <= 0) return new Date(now);
  if (successStreak === 1) return new Date(now + 60 * 60 * 1000);
  if (successStreak === 2) return new Date(now + 24 * 60 * 60 * 1000);
  if (successStreak === 3) return new Date(now + 3 * 24 * 60 * 60 * 1000);
  return new Date(now + 7 * 24 * 60 * 60 * 1000);
};

app.post(
  "/api/exercises/submit",
  rateLimit,
  requireUser,
  async (req: Request, res: Response) => {
    const parsed = exerciseSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Invalid payload", details: parsed.error.flatten() });
      return;
    }

    const { id, itemType } = parsed.data;
    const correct = parsed.data.correct ?? true;
    const userId = (req as any).user?.userId as string;

    const where =
      itemType === ItemType.PARAGRAPH_QUESTION
        ? { paragraphQuestionId: id }
        : { importantWordId: id };

    const existing = await prisma.userProgress.findFirst({
      where: { userId, itemType, ...where },
    });

    const correctCount = (existing?.correctCount ?? 0) + (correct ? 1 : 0);
    const wrongCount = (existing?.wrongCount ?? 0) + (!correct ? 1 : 0);
    const successStreak = correct ? (existing?.successStreak ?? 0) + 1 : 0;
    const total = correctCount + wrongCount;
    const knowledgeScore =
      total === 0 ? 0 : Number(((correctCount / total) * 100).toFixed(2));

    const data = {
      userId,
      itemType,
      paragraphQuestionId: itemType === ItemType.PARAGRAPH_QUESTION ? id : null,
      importantWordId: itemType === ItemType.IMPORTANT_WORD ? id : null,
      correctCount,
      wrongCount,
      successStreak,
      knowledgeScore,
      lastReviewed: new Date(),
      nextReview: calcNextReview(successStreak),
    };

    const updated = existing
      ? await prisma.userProgress.update({ where: { id: existing.id }, data })
      : await prisma.userProgress.create({ data });

    res.status(200).json({
      itemType,
      progress: {
        correctCount: updated.correctCount,
        wrongCount: updated.wrongCount,
        knowledgeScore: updated.knowledgeScore,
        successStreak: updated.successStreak,
        lastReviewed: updated.lastReviewed,
        nextReview: updated.nextReview,
      },
    });
  }
);

// Progress batch
type ProgressEvent = {
  itemId: string;
  itemType: ItemType;
  result: "correct" | "incorrect";
  timestamp: number;
};

app.post(
  "/api/progress/batch",
  rateLimit,
  requireUser,
  async (req: Request, res: Response) => {
    const events = (req.body as { events?: unknown }).events as
      | ProgressEvent[]
      | undefined;
    if (!Array.isArray(events) || events.length === 0) {
      res.status(400).json({
        error: { message: "No events provided", code: "BAD_REQUEST" },
      });
      return;
    }

    const validEvents = events.filter(
      (ev) =>
        ev &&
        typeof ev.itemId === "string" &&
        Object.values(ItemType).includes(ev.itemType) &&
        (ev.result === "correct" || ev.result === "incorrect") &&
        typeof ev.timestamp === "number"
    );

    if (validEvents.length === 0) {
      res.status(400).json({
        error: { message: "No valid events provided", code: "BAD_REQUEST" },
      });
      return;
    }

    const updates: Record<string, unknown> = {};

    try {
      await prisma.$transaction(async (tx) => {
        const existing = await tx.userProgress.findMany({
          where: {
            userId: (req as any).user.userId,
            OR: [
              {
                itemType: ItemType.PARAGRAPH_QUESTION,
                paragraphQuestionId: { in: validEvents.map((e) => e.itemId) },
              },
              {
                itemType: ItemType.IMPORTANT_WORD,
                importantWordId: { in: validEvents.map((e) => e.itemId) },
              },
            ],
          },
        });
        const mapKey = (e: ProgressEvent) => `${e.itemId}:${e.itemType}`;
        type ProgressRow = (typeof existing)[number];
        const existingMap = new Map<string, ProgressRow>(
          existing.map((row) => {
            const id =
              row.itemType === ItemType.PARAGRAPH_QUESTION
                ? row.paragraphQuestionId
                : row.importantWordId;
            return [
              mapKey({
                itemId: id ?? "",
                itemType: row.itemType,
                result: "correct",
                timestamp: 0,
              }),
              row,
            ];
          })
        );

        for (const ev of validEvents) {
          const key = mapKey(ev);
          const current = existingMap.get(key);
          const now = new Date();

          if (!current) {
            const successStreak = ev.result === "correct" ? 1 : 0;
            const nextReview = new Date(
              now.getTime() +
                (ev.result === "correct" ? 60 * 60 * 1000 : 5 * 60 * 1000)
            );
            const created = await tx.userProgress.create({
              data: {
                userId: (req as any).user.userId,
                itemType: ev.itemType,
                paragraphQuestionId:
                  ev.itemType === ItemType.PARAGRAPH_QUESTION
                    ? ev.itemId
                    : null,
                importantWordId:
                  ev.itemType === ItemType.IMPORTANT_WORD ? ev.itemId : null,
                correctCount: ev.result === "correct" ? 1 : 0,
                wrongCount: ev.result === "incorrect" ? 1 : 0,
                successStreak,
                knowledgeScore: ev.result === "correct" ? 1 : 0,
                lastReviewed: now,
                nextReview,
              },
            });
            updates[ev.itemId] = created;
            continue;
          }

          const correctCount =
            current.correctCount + (ev.result === "correct" ? 1 : 0);
          const wrongCount =
            current.wrongCount + (ev.result === "incorrect" ? 1 : 0);
          const successStreak =
            ev.result === "correct" ? current.successStreak + 1 : 0;
          const nextReview = new Date(
            now.getTime() +
              (ev.result === "correct"
                ? 60 * 60 * 1000 * Math.max(1, successStreak)
                : 5 * 60 * 1000)
          );

          const updated = await tx.userProgress.update({
            where: { id: current.id },
            data: {
              correctCount,
              wrongCount,
              successStreak,
              knowledgeScore:
                correctCount / Math.max(1, correctCount + wrongCount),
              lastReviewed: now,
              nextReview,
            },
          });
          updates[ev.itemId] = updated;
        }
      });

      res.status(200).json({ progress: updates });
    } catch (error) {
      console.error("[api/progress/batch] error", error);
      res.status(500).json({
        error: { message: "Internal server error", code: "SERVER_ERROR" },
      });
    }
  }
);

// Translation helper (DeepL)
const deeplEndpointForKey = (key: string) => {
  const trimmed = key.trim();
  return trimmed.endsWith(":fx")
    ? "https://api-free.deepl.com/v2/translate"
    : "https://api.deepl.com/v2/translate";
};

app.post(
  "/api/translate",
  rateLimit,
  requireUser,
  async (req: Request, res: Response) => {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    const target =
      typeof req.body?.target_lang === "string" ? req.body.target_lang : "EN";
    const apiKey = process.env.DEEPL_API_KEY ?? "";

    if (!apiKey) {
      res.status(500).json({
        error: { message: "DEEPL_API_KEY missing", code: "SERVER_CONFIG" },
      });
      return;
    }

    if (!text) {
      res
        .status(400)
        .json({ error: { message: "Text is required", code: "BAD_REQUEST" } });
      return;
    }

    try {
      const response = await fetch(deeplEndpointForKey(apiKey), {
        method: "POST",
        headers: {
          Authorization: `DeepL-Auth-Key ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: [text], target_lang: target }),
      });

      if (!response.ok) {
        const errText = await response.text();
        res.status(response.status).json({
          error: {
            message: "Translation failed",
            code: "DEEPL_ERROR",
            details: errText,
          },
        });
        return;
      }

      const json = (await response.json()) as {
        translations?: { text: string; detected_source_language: string }[];
      };
      const translated = json.translations?.[0]?.text ?? "";
      res.status(200).json({
        text: translated,
        detectedSourceLanguage:
          json.translations?.[0]?.detected_source_language ?? null,
      });
    } catch (err) {
      console.error("[api/translate] error", err);
      res.status(500).json({
        error: { message: "Internal server error", code: "SERVER_ERROR" },
      });
    }
  }
);

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
