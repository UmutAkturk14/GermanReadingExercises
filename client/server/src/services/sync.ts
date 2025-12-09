import type { GeneratedParagraph, StudyMode } from "../types/generation";

type GraphQLResult<T> = {
  data?: T;
  errors?: { message: string }[];
};

const defaultGraphQLEndpoint = "http://127.0.0.1:3000/api/graphql";

const GRAPHQL_ENDPOINT =
  process.env.GRAPHQL_ENDPOINT ?? defaultGraphQLEndpoint;

const CREATE_PARAGRAPH = `
  mutation CreateParagraph($input: CreateParagraphInput!) {
    createParagraph(input: $input) {
      id
    }
  }
`;

async function callGraphQL<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`GraphQL request failed with status ${res.status}`);
  }

  const json = (await res.json()) as GraphQLResult<T>;
  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }

  if (!json.data) {
    throw new Error("GraphQL response missing data");
  }

  return json.data;
}

export async function syncGeneratedQuestionsToDB(
  mode: StudyMode,
  items: GeneratedParagraph[],
) {
  if (mode !== "reading") {
    throw new Error("Only reading mode is supported.");
  }

  for (const item of items) {
    await callGraphQL(CREATE_PARAGRAPH, {
      input: {
        title: item.title,
        theme: item.theme,
        topic: item.topic,
        level: item.level,
        content: item.content,
        questions: item.questions,
        importantWords: item.importantWords,
      },
    });
  }
}
