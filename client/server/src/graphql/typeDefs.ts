import gql from "graphql-tag";

export const typeDefs = gql`
  scalar Date

  type Paragraph {
    id: ID!
    title: String
    theme: String
    topic: String
    level: String
    content: String!
    createdAt: Date!
    updatedAt: Date!
    questions: [ParagraphQuestion!]!
    importantWords: [ImportantWord!]!
  }

  type ParagraphQuestion {
    id: ID!
    paragraphId: ID!
    question: String!
    answer: String!
    choices: [String!]!
    createdAt: Date!
    updatedAt: Date!
    progress: UserProgress!
  }

  type ImportantWord {
    id: ID!
    paragraphId: ID!
    term: String!
    meaning: String!
    usageSentence: String!
    createdAt: Date!
    updatedAt: Date!
    progress: UserProgress!
  }

  type UserProgress {
    correctCount: Int!
    wrongCount: Int!
    knowledgeScore: Float!
    successStreak: Int!
    lastReviewed: Date!
    nextReview: Date!
  }

  type Query {
    getParagraphs(theme: String, level: String): [Paragraph!]!
  }

  input ParagraphQuestionInput {
    question: String!
    answer: String!
    choices: [String!]!
  }

  input ImportantWordInput {
    term: String!
    meaning: String!
    usageSentence: String!
  }

  input CreateParagraphInput {
    title: String
    theme: String
    topic: String
    level: String
    content: String!
    questions: [ParagraphQuestionInput!]!
    importantWords: [ImportantWordInput!]!
  }

  type Mutation {
    createParagraph(input: CreateParagraphInput!): Paragraph!
    updateParagraphQuestionStats(id: ID!, correct: Boolean): ParagraphQuestion!
    updateImportantWordStats(id: ID!, correct: Boolean): ImportantWord!
    generateStudyContent(level: String!): String!
  }
`;
