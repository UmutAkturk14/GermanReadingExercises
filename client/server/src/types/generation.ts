export type StudyMode = "reading";

export type GeneratedImportantWord = {
  term: string;
  meaning: string;
  usageSentence: string;
};

export type GeneratedParagraphQuestion = {
  question: string;
  answer: string;
  choices?: string[];
};

export type GeneratedParagraph = {
  title?: string;
  theme?: string;
  topic?: string;
  level?: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  content: string;
  questions: GeneratedParagraphQuestion[];
  importantWords: GeneratedImportantWord[];
};

export type GenerationResult = GeneratedParagraph[];
