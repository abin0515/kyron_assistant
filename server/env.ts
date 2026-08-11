import "server-only";

type ServerEnv = {
  KYRON_API_KEY: string;
  KYRON_API_BASE_URL: string;
};

type OpenAIEnv = {
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;
};

let cachedServerEnv: ServerEnv | undefined;
let cachedOpenAIEnv: OpenAIEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cachedServerEnv) {
    return cachedServerEnv;
  }

  const apiKey = process.env.KYRON_API_KEY?.trim();

  if (!apiKey || apiKey === "replace_with_your_kyron_api_key") {
    throw new Error("KYRON_API_KEY is not configured.");
  }

  cachedServerEnv = {
    KYRON_API_KEY: apiKey,
    KYRON_API_BASE_URL: (
      process.env.KYRON_API_BASE_URL ??
      "https://app.kyronlearning.com/api/v2"
    ).replace(/\/+$/, ""),
  };

  return cachedServerEnv;
}

export function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (
    !databaseUrl ||
    databaseUrl === "replace_with_your_neon_database_url"
  ) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return databaseUrl;
}

export function getOpenAIEnv(): OpenAIEnv {
  if (cachedOpenAIEnv) {
    return cachedOpenAIEnv;
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey || apiKey === "replace_with_your_openai_api_key") {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  cachedOpenAIEnv = {
    OPENAI_API_KEY: apiKey,
    OPENAI_MODEL:
      process.env.OPENAI_MODEL?.trim() || "gpt-5.6-terra",
  };

  return cachedOpenAIEnv;
}
