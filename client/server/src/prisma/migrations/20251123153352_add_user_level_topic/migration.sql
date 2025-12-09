-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateEnum
CREATE TABLE "ItemType" (
    "value" TEXT NOT NULL PRIMARY KEY
);

INSERT INTO "ItemType" ("value") VALUES ('PARAGRAPH_QUESTION'), ('IMPORTANT_WORD');

-- CreateTable
CREATE TABLE "Paragraph" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT,
    "theme" TEXT,
    "topic" TEXT,
    "level" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ParagraphQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paragraphId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "choices" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ParagraphQuestion_paragraphId_fkey" FOREIGN KEY ("paragraphId") REFERENCES "Paragraph" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportantWord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paragraphId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "usageSentence" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImportantWord_paragraphId_fkey" FOREIGN KEY ("paragraphId") REFERENCES "Paragraph" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "paragraphQuestionId" TEXT,
    "importantWordId" TEXT,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "wrongCount" INTEGER NOT NULL DEFAULT 0,
    "successStreak" INTEGER NOT NULL DEFAULT 0,
    "knowledgeScore" REAL NOT NULL DEFAULT 0,
    "lastReviewed" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextReview" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UserProgress_itemType_fkey" FOREIGN KEY ("itemType") REFERENCES "ItemType" ("value") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UserProgress_paragraphQuestionId_fkey" FOREIGN KEY ("paragraphQuestionId") REFERENCES "ParagraphQuestion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserProgress_importantWordId_fkey" FOREIGN KEY ("importantWordId") REFERENCES "ImportantWord" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "ParagraphQuestion_paragraphId_idx" ON "ParagraphQuestion"("paragraphId");

-- CreateIndex
CREATE INDEX "ImportantWord_paragraphId_idx" ON "ImportantWord"("paragraphId");

-- CreateIndex
CREATE INDEX "UserProgress_userId_itemType_idx" ON "UserProgress"("userId", "itemType");
CREATE INDEX "UserProgress_userId_paragraphQuestionId_idx" ON "UserProgress"("userId", "paragraphQuestionId");
CREATE INDEX "UserProgress_userId_importantWordId_idx" ON "UserProgress"("userId", "importantWordId");
