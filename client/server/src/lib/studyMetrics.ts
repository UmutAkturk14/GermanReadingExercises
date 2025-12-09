import type { PrismaClient } from "@prisma/client";

export const calculateKnowledgeScore = (
  correctCount: number,
  wrongCount: number,
) => {
  const total = correctCount + wrongCount;
  if (total === 0) return 0;
  return Number(((correctCount / total) * 100).toFixed(2));
};

export async function updateParagraphQuestionStats(
  prisma: PrismaClient,
  id: string,
) {
  const existing = await prisma.paragraphQuestion.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new Error("ParagraphQuestion not found");
  }

  return existing;
}

export async function updateImportantWordStats(
  prisma: PrismaClient,
  id: string,
) {
  const existing = await prisma.importantWord.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new Error("ImportantWord not found");
  }

  return existing;
}
