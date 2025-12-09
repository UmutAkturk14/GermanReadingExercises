import { PrismaClient } from "@prisma/client";
import type { GraphQLContext } from "./types/context";

const prisma = new PrismaClient();

export const createContext = (): GraphQLContext => ({
  prisma,
  isAuthenticated: false,
  user: null,
});
