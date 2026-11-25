import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM. Each password gets a fresh random IV. The entry id is bound in as
// additional authenticated data, so a ciphertext copied onto a different row will not decrypt.

function getKey(): Buffer {
  const raw = process.env.VAULT_KEY;
  if (!raw) throw new Error("VAULT_KEY is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("VAULT_KEY must be 32 bytes, base64 encoded");
  return key;
}

export function encrypt(plain: string, entryId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  cipher.setAAD(Buffer.from(entryId, "utf8"));
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(".");
}

export function decrypt(payload: string, entryId: string): string {
  const [version, iv, tag, ct] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !ct) throw new Error("Unrecognised ciphertext format");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64"));
  decipher.setAAD(Buffer.from(entryId, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
}
