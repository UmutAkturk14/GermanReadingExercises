/* eslint-disable @typescript-eslint/no-explicit-any */
import { GraphQLScalarType, Kind } from "graphql";
import { ItemType, PrismaClient } from "@prisma/client";
import type { GraphQLContext } from "../types/context";
import type { GenerationResult } from "../types/generation";
import { generateQuestions } from "../services/openai";

const prismaFallback = new PrismaClient();

const sanitize = (value: string, max = 120) =>
  value
    .replace(/<[^>]*>?/g, "")
    .trim()
    .slice(0, max);

const calcNextReview = (successStreak: number) => {
  const now = Date.now();
  if (successStreak <= 0) return new Date(now);
  if (successStreak === 1) return new Date(now + 60 * 60 * 1000);
  if (successStreak === 2) return new Date(now + 24 * 60 * 60 * 1000);
  if (successStreak === 3) return new Date(now + 3 * 24 * 60 * 60 * 1000);
  return new Date(now + 7 * 24 * 60 * 60 * 1000);
};

const progressDefaults = {
  correctCount: 0,
  wrongCount: 0,
  knowledgeScore: 0,
  successStreak: 0,
  lastReviewed: new Date(0),
  nextReview: new Date(0),
};

const toProgress = (record?: any) => {
  if (!record) return progressDefaults;
  return {
    correctCount: record.correctCount ?? 0,
    wrongCount: record.wrongCount ?? 0,
    knowledgeScore: record.knowledgeScore ?? 0,
    successStreak: record.successStreak ?? 0,
    lastReviewed: record.lastReviewed ?? new Date(0),
    nextReview: record.nextReview ?? new Date(0),
  };
};

const assertNonEmpty = (value: string, label: string) => {
  if (!value.trim()) {
    throw new Error(`${label} is required.`);
  }
};

const maskError = (error: unknown) => {
  console.error("GraphQL mutation error:", error);
  return new Error("Internal server error");
};

const DateScalar = new GraphQLScalarType({
  name: "Date",
  description: "ISO-8601 date string",
  serialize(value) {
    return new Date(value as string | number | Date).toISOString();
  },
  parseValue(value) {
    return new Date(value as string);
  },
  parseLiteral(ast) {
    return ast.kind === Kind.STRING ? new Date(ast.value) : null;
  },
});

const upsertUserProgress = async (
  prisma: PrismaClient,
  userId: string,
  itemType: ItemType,
  opts: { paragraphQuestionId?: string; importantWordId?: string },
  correct: boolean,
) => {
  const where =
    itemType === ItemType.PARAGRAPH_QUESTION
      ? { paragraphQuestionId: opts.paragraphQuestionId ?? "" }
      : { importantWordId: opts.importantWordId ?? "" };

  const existing =
    (await prisma.userProgress.findFirst({
      where: { userId, itemType, ...where },
    })) ?? null;

  const correctCount = (existing?.correctCount ?? 0) + (correct ? 1 : 0);
  const wrongCount = (existing?.wrongCount ?? 0) + (!correct ? 1 : 0);
  const successStreak = correct ? (existing?.successStreak ?? 0) + 1 : 0;
  const total = correctCount + wrongCount;
  const knowledgeScore =
    total === 0 ? 0 : Number(((correctCount / total) * 100).toFixed(2));

  const data = {
    userId,
    itemType,
    paragraphQuestionId: opts.paragraphQuestionId ?? null,
    importantWordId: opts.importantWordId ?? null,
    correctCount,
    wrongCount,
    successStreak,
    knowledgeScore,
    lastReviewed: new Date(),
    nextReview: calcNextReview(successStreak),
  };

  if (existing?.id) {
    return prisma.userProgress.update({ where: { id: existing.id }, data });
  }
  return prisma.userProgress.create({ data });
};

const fetchProgressMap = async (
  prisma: PrismaClient,
  userId: string,
  questionIds: string[],
  wordIds: string[],
) => {
  if (questionIds.length === 0 && wordIds.length === 0) return new Map();
  const rows = await prisma.userProgress.findMany({
    where: {
      userId,
      OR: [
        {
          itemType: ItemType.PARAGRAPH_QUESTION,
          paragraphQuestionId: { in: questionIds },
        },
        {
          itemType: ItemType.IMPORTANT_WORD,
          importantWordId: { in: wordIds },
        },
      ],
    },
  });

  return new Map<string, any>(
    rows.map((row) => {
      const key =
        row.itemType === ItemType.PARAGRAPH_QUESTION
          ? `pq:${row.paragraphQuestionId}`
          : `iw:${row.importantWordId}`;
      return [key, row];
    }),
  );
};

const persistGenerationResult = async (
  ctx: GraphQLContext,
  theme: string,
  topic: string,
  level: string,
  items: GenerationResult,
) => {
  if (!Array.isArray(items) || items.length === 0) return;

  for (const item of items) {
    await ctx.prisma.paragraph.create({
      data: {
        title: item.title ?? null,
        theme: item.theme ?? theme,
        topic: item.topic ?? topic ?? theme,
        level: item.level ?? level,
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
  }
};

export const resolvers = {
  Date: DateScalar,
  Query: {
    getParagraphs: async (
      _: unknown,
      args: { theme?: string; level?: string },
      ctx: GraphQLContext,
    ) => {
      const client = ctx.prisma ?? prismaFallback;
      const where: any = {};
      if (args.theme) where.theme = args.theme;
      if (args.level) where.level = args.level;

      const paragraphs = await client.paragraph.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          questions: true,
          importantWords: true,
        },
      });

      if (!ctx.user) {
        return paragraphs.map((p) => ({
          ...p,
          questions: p.questions.map((q) => ({ ...q, progress: progressDefaults })),
          importantWords: p.importantWords.map((w) => ({
            ...w,
            progress: progressDefaults,
          })),
        }));
      }

      const questionIds = paragraphs.flatMap((p) => p.questions.map((q) => q.id));
      const wordIds = paragraphs.flatMap((p) => p.importantWords.map((w) => w.id));
      const progressMap = await fetchProgressMap(client, ctx.user.userId, questionIds, wordIds);

      return paragraphs.map((p) => ({
        ...p,
        questions: p.questions.map((q) => ({
          ...q,
          progress: toProgress(progressMap.get(`pq:${q.id}`)),
        })),
        importantWords: p.importantWords.map((w) => ({
          ...w,
          progress: toProgress(progressMap.get(`iw:${w.id}`)),
        })),
      }));
    },
  },
  Mutation: {
    createParagraph: async (
      _: unknown,
      {
        input,
      }: {
        input: {
          title?: string | null;
          theme?: string | null;
          topic?: string | null;
          level?: string | null;
          content: string;
          questions: { question: string; answer: string; choices?: string[] }[];
          importantWords: { term: string; meaning: string; usageSentence: string }[];
        };
      },
      ctx: GraphQLContext,
    ) => {
      if (!ctx.isAuthenticated) {
        throw new Error("Unauthorized");
      }
      try {
        assertNonEmpty(input.content, "Content");
        const content = sanitize(input.content, 5000);
        const title = input.title ? sanitize(input.title, 160) : null;
        const theme = input.theme ? sanitize(input.theme) : null;
        const topic = input.topic ? sanitize(input.topic) : null;
        const level = input.level ? sanitize(input.level, 8) : null;
        const questions = (input.questions ?? []).map((q) => ({
          question: sanitize(q.question, 240),
          answer: sanitize(q.answer, 300),
          choices: Array.isArray(q.choices)
            ? q.choices
                .filter((c): c is string => typeof c === "string")
                .map((c) => sanitize(c, 200))
            : [],
        }));
        const importantWords = (input.importantWords ?? []).map((w) => ({
          term: sanitize(w.term, 120),
          meaning: sanitize(w.meaning, 240),
          usageSentence: sanitize(w.usageSentence, 320),
        }));

        const created = await ctx.prisma.paragraph.create({
          data: {
            title,
            theme,
            topic,
            level,
            content,
            questions: { create: questions },
            importantWords: { create: importantWords },
          },
          include: { questions: true, importantWords: true },
        });

        return {
          ...created,
          questions: created.questions.map((q) => ({
            ...q,
            progress: progressDefaults,
          })),
          importantWords: created.importantWords.map((w) => ({
            ...w,
            progress: progressDefaults,
          })),
        };
      } catch (error) {
        throw maskError(error);
      }
    },
    updateParagraphQuestionStats: async (
      _: unknown,
      { id, correct = true }: { id: string; correct?: boolean },
      ctx: GraphQLContext,
    ) => {
      if (!ctx.isAuthenticated || !ctx.user) {
        throw new Error("Unauthorized");
      }
      try {
        const client = ctx.prisma ?? prismaFallback;
        await upsertUserProgress(
          client,
          ctx.user.userId,
          ItemType.PARAGRAPH_QUESTION,
          { paragraphQuestionId: id },
          correct,
        );
        const item = await client.paragraphQuestion.findUnique({
          where: { id },
        });
        const progress =
          (await client.userProgress.findFirst({
            where: {
              userId: ctx.user.userId,
              itemType: ItemType.PARAGRAPH_QUESTION,
              paragraphQuestionId: id,
            },
          })) ?? null;
        return { ...item, progress: toProgress(progress) };
      } catch (error) {
        throw maskError(error);
      }
    },
    updateImportantWordStats: async (
      _: unknown,
      { id, correct = true }: { id: string; correct?: boolean },
      ctx: GraphQLContext,
    ) => {
      if (!ctx.isAuthenticated || !ctx.user) {
        throw new Error("Unauthorized");
      }
      try {
        const client = ctx.prisma ?? prismaFallback;
        await upsertUserProgress(
          client,
          ctx.user.userId,
          ItemType.IMPORTANT_WORD,
          { importantWordId: id },
          correct,
        );
        const item = await client.importantWord.findUnique({
          where: { id },
        });
        const progress =
          (await client.userProgress.findFirst({
            where: {
              userId: ctx.user.userId,
              itemType: ItemType.IMPORTANT_WORD,
              importantWordId: id,
            },
          })) ?? null;
        return { ...item, progress: toProgress(progress) };
      } catch (error) {
        throw maskError(error);
      }
    },
    generateStudyContent: async (
      _: unknown,
      { level }: { level: string },
      ctx: GraphQLContext,
    ) => {
      if (!ctx.isAuthenticated) {
        throw new Error("Unauthorized");
      }
      if (ctx.user && ctx.user.role !== "admin") {
        throw new Error("Forbidden: admin role required for generation.");
      }
      try {
        const cleanLevel = sanitize(level, 4) || "A1";
        const cleanTheme = "Various";
        const cleanTopic = "Various";

        const generated = await generateQuestions("reading", cleanTheme, cleanLevel, cleanTopic);
        try {
          await persistGenerationResult(ctx, cleanTheme, cleanTopic, cleanLevel, generated);
        } catch (error) {
          console.error("Persist generated content failed, continuing", error);
        }
        return JSON.stringify(generated);
      } catch (error) {
        throw maskError(error);
      }
    },
  },
};
