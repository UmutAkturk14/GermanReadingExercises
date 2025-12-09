export type StudyMode = "reading";

export type NormalizedQuestion = {
  id: string;
  question: string;
  answer: string;
  choices?: string[];
};

export type NormalizedImportantWord = {
  id: string;
  term: string;
  meaning: string;
  usageSentence: string;
};

export type NormalizedParagraph = {
  id: string;
  title?: string | null;
  theme?: string | null;
  topic?: string | null;
  level?: string | null;
  content: string;
  questions: NormalizedQuestion[];
  importantWords: NormalizedImportantWord[];
};

export type NormalizedContent = {
  mode: StudyMode;
  theme: string;
  paragraphs: NormalizedParagraph[];
};
