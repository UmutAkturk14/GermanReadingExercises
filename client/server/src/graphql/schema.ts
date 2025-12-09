import { createSchema } from "graphql-yoga";
import { resolvers } from "../resolvers/index";
import { typeDefs } from "./typeDefs";

export const schema = createSchema({
  typeDefs,
  resolvers,
});
