// Unit tests exercise pure logic, but several modules import config.ts at
// load time, which insists on a full environment. Provide inert defaults so
// tests run identically with or without a local .env (e.g. in CI).
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.S3_BUCKET ??= "test-bucket";
process.env.S3_ACCESS_KEY_ID ??= "test";
process.env.S3_SECRET_ACCESS_KEY ??= "test";
process.env.ADMIN_TOKEN ??= "test-admin-token-not-used";
process.env.SESSION_SECRET ??= "test-session-secret-for-unit-tests";
