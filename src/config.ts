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

const isProduction = process.env.NODE_ENV === "production";
const publicBaseUrl = optional("PUBLIC_BASE_URL", "http://localhost:8787");

// Known-weak placeholder values that must never reach production.
const WEAK_SECRETS = new Set([
  "change-me-admin-token",
  "change-me-session-secret",
  "dev-insecure-session-secret-change-me",
]);

function secret(name: string, devFallback?: string): string {
  const v = process.env[name] ?? devFallback;
  if (!v) throw new Error(`Missing required env var: ${name}`);
  if (isProduction && (WEAK_SECRETS.has(v) || v.length < 16)) {
    throw new Error(
      `${name} is a default/weak value. Set a strong (>=16 char) secret before running in production.`,
    );
  }
  return v;
}

// Mock SSO is an explicit, non-production opt-in. It must never be derived
// from the *absence* of configuration — a missing LINKEDIN_CLIENT_ID in prod
// would otherwise silently turn the login page into an account-takeover form.
const linkedinMock = bool("LINKEDIN_MOCK", false);
if (linkedinMock && isProduction) {
  throw new Error("LINKEDIN_MOCK=true is not allowed when NODE_ENV=production.");
}

export const config = {
  isProduction,
  port: Number(optional("PORT", "8787")),
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

  adminToken: secret("ADMIN_TOKEN"),

  // Secret used to sign web session cookies.
  sessionSecret: secret("SESSION_SECRET", "dev-insecure-session-secret-change-me"),

  // How long a freshly minted/reissued candidate token stays valid.
  tokenTtlDays: Number(optional("TOKEN_TTL_DAYS", "90")),

  // When true, a confirmed session-log upload is required to apply and the
  // session-log MCP tools are registered. Off by default in the job-link flow.
  requireSessionLog: bool("REQUIRE_SESSION_LOG", false),

  // Optional webhook POSTed whenever a new application is recorded.
  applicationWebhookUrl: process.env.APPLICATION_WEBHOOK_URL || "",

  linkedin: {
    clientId: process.env.LINKEDIN_CLIENT_ID || "",
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET || "",
    redirectUri: optional("LINKEDIN_REDIRECT_URI", `${publicBaseUrl}/auth/linkedin/callback`),
    // Dev-only mock of the OIDC flow. Explicit opt-in, refused in production.
    mock: linkedinMock,
  },
} as const;

export type Config = typeof config;
