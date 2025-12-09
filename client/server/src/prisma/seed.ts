import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.paragraphQuestion.deleteMany();
  await prisma.importantWord.deleteMany();
  await prisma.paragraph.deleteMany();
  // Seed default admin account
  await prisma.user.deleteMany({ where: { email: "admin@example.com" } });
  await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {
      role: "admin",
      passwordHash: await bcrypt.hash("123456", 10),
    },
    create: {
      email: "admin@example.com",
      passwordHash: await bcrypt.hash("123456", 10),
      role: "admin",
    },
  });

  await prisma.paragraph.create({
    data: {
      title: "Ein Tag in Berlin",
      theme: "Travel",
      topic: "Berlin",
      level: "A2",
      content:
        "Anna besucht ihre Freundin in Berlin. Sie fährt mit der S-Bahn zum Alexanderplatz. Dort trinkt sie einen Kaffee und schaut auf den Fernsehturm. Später geht sie an der Spree spazieren und macht Fotos. Am Abend essen die beiden zusammen in einem kleinen Restaurant.",
      questions: {
        create: [
          {
            question: "Wohin fährt Anna in Berlin?",
            answer: "Zum Alexanderplatz mit der S-Bahn.",
            choices: [
              "Zum Alexanderplatz mit der S-Bahn.",
              "Zum Brandenburger Tor mit dem Bus.",
              "Zum Hauptbahnhof mit dem Taxi.",
              "Zum Potsdamer Platz zu Fuß.",
            ],
          },
          {
            question: "Was macht Anna an der Spree?",
            answer: "Sie geht spazieren und macht Fotos.",
            choices: [
              "Sie geht spazieren und macht Fotos.",
              "Sie schwimmt im Fluss.",
              "Sie fährt mit dem Boot.",
              "Sie isst in einem Imbiss.",
            ],
          },
        ],
      },
      importantWords: {
        create: [
          {
            term: "der Alexanderplatz",
            meaning: "central square in Berlin",
            usageSentence: "Sie steigt am Alexanderplatz aus der S-Bahn.",
          },
          {
            term: "die Spree",
            meaning: "river Spree",
            usageSentence: "Anna geht an der Spree spazieren.",
          },
          {
            term: "der Fernsehturm",
            meaning: "TV tower",
            usageSentence: "Sie schaut auf den Fernsehturm und trinkt Kaffee.",
          },
        ],
      },
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
