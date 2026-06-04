import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v === "true" || v === "1";
}

const publicBaseUrl = optional("PUBLIC_BASE_URL", "http://localhost:8080");

export const config = {
  port: Number(optional("PORT", "8080")),
  publicBaseUrl,

  databaseUrl: required("DATABASE_URL"),

  s3: {
    endpoint: process.env.S3_ENDPOINT || undefined, // undefined => real AWS S3
    region: optional("S3_REGION", "us-east-1"),
    bucket: required("S3_BUCKET"),
    accessKeyId: required("S3_ACCESS_KEY_ID"),
    secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
    forcePathStyle: bool("S3_FORCE_PATH_STYLE", true),
  },

  adminToken: required("ADMIN_TOKEN"),

  // Secret used to sign web session cookies.
  sessionSecret: optional("SESSION_SECRET", "dev-insecure-session-secret-change-me"),

  // How long a freshly minted/reissued candidate token stays valid.
  tokenTtlDays: Number(optional("TOKEN_TTL_DAYS", "90")),

  requireSessionLog: bool("REQUIRE_SESSION_LOG", true),

  linkedin: {
    clientId: process.env.LINKEDIN_CLIENT_ID || "",
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET || "",
    redirectUri: optional("LINKEDIN_REDIRECT_URI", `${publicBaseUrl}/auth/linkedin/callback`),
    // Mock mode lets you exercise the full SSO flow locally without a LinkedIn app.
    // Defaults to ON whenever no real client id is configured.
    mock: bool("LINKEDIN_MOCK", !process.env.LINKEDIN_CLIENT_ID),
  },
} as const;

export type Config = typeof config;
