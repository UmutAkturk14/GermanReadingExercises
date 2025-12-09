import { getToken } from "./authClient";
import type { NormalizedContent } from "../types/content";

const GRAPHQL_ENDPOINT =
  import.meta.env.VITE_GRAPHQL_ENDPOINT ?? "/api/graphql";

const GET_PARAGRAPHS = `
  query GetParagraphs($level: String) {
    getParagraphs(level: $level) {
      id
      title
      theme
      topic
      level
      content
      questions {
        id
        question
        answer
        choices
      }
      importantWords {
        id
        term
        meaning
        usageSentence
      }
    }
  }
`;

type ParagraphRow = {
  id: string;
  title?: string | null;
  theme?: string | null;
  topic?: string | null;
  level?: string | null;
  content: string;
  questions: { id: string; question: string; answer: string; choices?: string[] }[];
  importantWords: { id: string; term: string; meaning: string; usageSentence: string }[];
};

type GraphQLResponse<T> = { data?: T; errors?: { message: string }[] };

export const fetchParagraphs = async (level?: string): Promise<NormalizedContent> => {
  const token = getToken();

  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query: GET_PARAGRAPHS, variables: { level } }),
  });

  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }

  const json = (await res.json()) as GraphQLResponse<{ getParagraphs: ParagraphRow[] }>;
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }

  const paragraphs =
    json.data?.getParagraphs.map((row) => ({
      id: row.id,
      title: row.title ?? null,
      theme: row.theme ?? "General",
      topic: row.topic ?? null,
      level: row.level ?? null,
      content: row.content,
      questions:
        row.questions?.map((q) => ({
          id: q.id,
          question: q.question,
          answer: q.answer,
          choices: Array.isArray(q.choices) ? q.choices : undefined,
        })) ?? [],
      importantWords: row.importantWords ?? [],
    })) ?? [];

  if (paragraphs.length === 0) {
    throw new Error("No paragraphs found in the database.");
  }

  return {
    mode: "reading",
    theme: paragraphs[0]?.theme ?? "General",
    paragraphs,
  };
};
