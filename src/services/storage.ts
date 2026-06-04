import { createHash } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config.js";

export const MAX_SESSION_LOG_BYTES = 50 * 1024 * 1024; // 50 MB safety cap

const s3 = new S3Client({
  region: config.s3.region,
  endpoint: config.s3.endpoint,
  forcePathStyle: config.s3.forcePathStyle,
  credentials: {
    accessKeyId: config.s3.accessKeyId,
    secretAccessKey: config.s3.secretAccessKey,
  },
});

/** Presign a PUT for the pending key. Client must send Content-Type only. */
export async function presignPut(
  key: string,
  contentType: string,
  expiresInSeconds = 900,
): Promise<{ url: string; expiresAt: string; requiredHeaders: Record<string, string> }> {
  const cmd = new PutObjectCommand({
    Bucket: config.s3.bucket,
    Key: key,
    ContentType: contentType,
  });
  const url = await getSignedUrl(s3, cmd, { expiresIn: expiresInSeconds });
  // expiresAt computed from a caller-provided clock to keep this pure/testable.
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
  return { url, expiresAt, requiredHeaders: { "Content-Type": contentType } };
}

export async function headObject(
  key: string,
): Promise<{ exists: boolean; size?: number; contentType?: string }> {
  try {
    const r = await s3.send(new HeadObjectCommand({ Bucket: config.s3.bucket, Key: key }));
    return { exists: true, size: r.ContentLength, contentType: r.ContentType };
  } catch {
    return { exists: false };
  }
}

/** Stream the object and compute its base64 SHA-256 — true integrity check. */
export async function downloadAndSha256B64(key: string): Promise<string> {
  const r = await s3.send(new GetObjectCommand({ Bucket: config.s3.bucket, Key: key }));
  const hash = createHash("sha256");
  const body = r.Body as AsyncIterable<Uint8Array>;
  for await (const chunk of body) hash.update(chunk);
  return hash.digest("base64");
}

/** Promote a pending object to its permanent key (copy then delete). */
export async function promoteObject(fromKey: string, toKey: string): Promise<void> {
  await s3.send(
    new CopyObjectCommand({
      Bucket: config.s3.bucket,
      CopySource: `${config.s3.bucket}/${fromKey}`,
      Key: toKey,
    }),
  );
  await s3.send(new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: fromKey }));
}
