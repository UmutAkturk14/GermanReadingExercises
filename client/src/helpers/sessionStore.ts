import type { NormalizedContent } from "../types/content";

const STORAGE_KEY = "gp_generated_content";
const ALLOWED_KEY_PATTERN = /^[a-zA-Z0-9-_]+$/;

type StoredPayload = {
  content: NormalizedContent;
  rawJson: string;
  theme: string;
};

const sanitizeTheme = (theme: string) =>
  theme.replace(/<[^>]*>?/g, "").trim().slice(0, 200);

const xorEncode = (input: string) => {
  const key = 29;
  return btoa(
    input
      .split("")
      .map((char) => String.fromCharCode(char.charCodeAt(0) ^ key))
      .join(""),
  );
};

const xorDecode = (input: string) => {
  const key = 29;
  const decoded = atob(input);
  return decoded
    .split("")
    .map((char) => String.fromCharCode(char.charCodeAt(0) ^ key))
    .join("");
};

export const saveGeneratedSession = (payload: StoredPayload) => {
  if (typeof window === "undefined") return;
  try {
    const safeTheme = sanitizeTheme(payload.theme);
    if (!safeTheme) return;

    const safeParagraphs = payload.content.paragraphs
      .filter((p) => ALLOWED_KEY_PATTERN.test(p.id))
      .map((p) => ({
        ...p,
        content: p.content.slice(0, 5000),
        questions: p.questions
          .filter((q) => ALLOWED_KEY_PATTERN.test(q.id))
          .map((q) => ({
            ...q,
            question: q.question.slice(0, 500),
            answer: q.answer.slice(0, 500),
          })),
        importantWords: p.importantWords
          .filter((w) => ALLOWED_KEY_PATTERN.test(w.id))
          .map((w) => ({
            ...w,
            term: w.term.slice(0, 200),
            meaning: w.meaning.slice(0, 400),
            usageSentence: w.usageSentence.slice(0, 400),
          })),
      }));

    const safePayload: StoredPayload = {
      ...payload,
      theme: safeTheme,
      content: {
        ...payload.content,
        paragraphs: safeParagraphs,
      },
      rawJson: payload.rawJson.slice(0, 4000),
    };

    const encoded = xorEncode(JSON.stringify(safePayload));
    window.sessionStorage.setItem(STORAGE_KEY, encoded);
  } catch (error) {
    console.warn("Failed to persist generated content:", error);
  }
};

export const loadGeneratedSession = (): StoredPayload | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const decoded = xorDecode(raw);
    return JSON.parse(decoded) as StoredPayload;
  } catch (error) {
    console.warn("Failed to read generated content:", error);
    return null;
  }
};

export const clearGeneratedSession = () => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn("Failed to clear generated content:", error);
  }
};
