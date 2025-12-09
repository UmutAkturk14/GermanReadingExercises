import OpenAI from "openai";
import type { GenerationResult, StudyMode } from "../types/generation";

type Level = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const OPENAI_PROMPT_TEMPLATE = `
You are a content generator for a German reading app.
Return ONLY a valid JSON array of exactly 2 items. No prose, no preamble, no markdown.

Each item must be a paragraph-level reading exercise with this shape:
{
  "title": string | null,
  "theme": string,
  "topic": string,
  "level": "A1" | "A2" | "B1" | "B2" | "C1" | "C2",
  "content": string, // a German reading text of ~180-400 words depending on level (shorter for A1/A2, longer for higher levels), divided into clear paragraphs separated by "\n\n"
  "questions": [
    { "question": string, "answer": string, "choices": [string, string, string, string] },
    ...
  ],
  "importantWords": [
    { "term": string, "meaning": string, "usageSentence": string },
    ...
  ]
}

Rules:
- Provide 1-2 comprehension questions per paragraph with 4 richer answer choices each (short phrases/sentences) and a clearly marked correct answer string.
- Provide 4-6 importantWords per paragraph; usageSentence must quote or paraphrase the term in context. Include the article and plural form in the term (e.g., "der Bahnhof (die Bahnhöfe)").
- Do not include id, createdAt, or updatedAt. Keep JSON strictly valid.
`;

export const readingSchema = {
  name: "ReadingExerciseArray",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      items: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "title",
            "theme",
            "topic",
            "level",
            "content",
            "questions",
            "importantWords",
          ],
          properties: {
            title: { type: ["string", "null"] },
            theme: { type: "string" },
            topic: { type: "string" },
            level: { type: "string" },
            content: { type: "string" },
            questions: {
              type: "array",
              minItems: 1,
              maxItems: 2,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["question", "answer", "choices"],
                properties: {
                  question: { type: "string" },
                  answer: { type: "string" },
                  choices: {
                    type: "array",
                    minItems: 4,
                    maxItems: 4,
                    items: { type: "string" },
                  },
                },
              },
            },
            importantWords: {
              type: "array",
              minItems: 3,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["term", "meaning", "usageSentence"],
                properties: {
                  term: { type: "string" },
                  meaning: { type: "string" },
                  usageSentence: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

async function fetchQuestionsForLevel(
  mode: StudyMode,
  theme: string,
  level: string,
  topic?: string
): Promise<GenerationResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing. Set it in /server/.env");
  }

  const safeTheme = theme
    .trim()
    .replace(/<[^>]*>?/gm, "")
    .slice(0, 200);
  const safeTopic = topic
    ? topic
        .trim()
        .replace(/<[^>]*>?/gm, "")
        .slice(0, 120)
    : "";
  const safeLevel: Level = /^A[12]|B[12]|C[12]$/.test(level)
    ? (level as Level)
    : "A1";
  const prompt = `${OPENAI_PROMPT_TEMPLATE}\nMode: ${mode}\nTheme: ${safeTheme}\nTopic: ${safeTopic || safeTheme}\nLevel: ${safeLevel}\nGenerate 2 paragraphs now.`;

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini-2025-04-14",
    messages: [{ role: "user", content: prompt }],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: readingSchema.name,
        schema: readingSchema.schema,
        strict: readingSchema.strict,
      },
    },
    temperature: 0.6,
  });

  const content = completion.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI response was empty or malformed.");
  }

  const raw = JSON.parse(content) as
    | GenerationResult
    | { items?: GenerationResult };
  const parsed = Array.isArray(raw) ? raw : raw.items;

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("OpenAI response did not contain items.");
  }

  return parsed;
}

export async function generateQuestions(
  mode: StudyMode,
  theme: string,
  level?: string,
  topic?: string
): Promise<GenerationResult> {
  const targetLevel: Level =
    level && /^A[12]|B[12]|C[12]$/.test(level) ? (level as Level) : "B1";

  const items = await fetchQuestionsForLevel(mode, theme, targetLevel, topic);
  console.log(`Fetching questions: ${theme}\nLevel: ${targetLevel}`);

  return items.map((item) => ({
    ...item,
    level: item.level || targetLevel,
    topic: item.topic || theme,
    theme: item.theme || theme,
  })) as GenerationResult;
}
