import crypto from "node:crypto";

const PAYLOAD_PREFIX = "v1";
const IV_BYTES = 12;
const KEY_HEX_LENGTH = 64;

/**
 * Validates and returns the 32-byte AES-256-GCM master key buffer.
 */
export function getMasterKeyBuffer(overrideKeyHex?: string): Buffer {
  const rawHex = (overrideKeyHex ?? process.env.MASTER_ENCRYPTION_KEY ?? "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(rawHex) || rawHex.length !== KEY_HEX_LENGTH) {
    throw new Error(
      "MASTER_ENCRYPTION_KEY must be a valid 64-character hex string (32 bytes for AES-256-GCM)"
    );
  }
  return Buffer.from(rawHex, "hex");
}

/**
 * Encrypts a secret string using AES-256-GCM with a random 12-byte IV per call.
 * Format: v1:<ivHex>:<authTagHex>:<ciphertextHex>
 */
export function encryptSecret(plaintext: string, overrideKeyHex?: string): string {
  const key = getMasterKeyBuffer(overrideKeyHex);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${PAYLOAD_PREFIX}:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts a v1 AES-256-GCM encrypted payload and verifies authentication tag integrity.
 */
export function decryptSecret(ciphertextPayload: string, overrideKeyHex?: string): string {
  const parts = ciphertextPayload.split(":");
  if (parts.length !== 4 || parts[0] !== PAYLOAD_PREFIX) {
    throw new Error("AES-256-GCM authentication failed or payload corrupted");
  }
  const [, ivHex, tagHex, dataHex] = parts;
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("AES-256-GCM authentication failed or payload corrupted");
  }
  try {
    const key = getMasterKeyBuffer(overrideKeyHex);
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(tagHex, "hex");
    const encryptedData = Buffer.from(dataHex, "hex");
    if (iv.length !== IV_BYTES || authTag.length !== 16) {
      throw new Error("Invalid IV or auth tag length");
    }
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    throw new Error("AES-256-GCM authentication failed or payload corrupted");
  }
}

/**
 * Redacts encryption keys, API keys, Bearer tokens, proxy passwords, and v1 ciphertexts from logs.
 */
export function redactSecrets(input: string): string {
  let output = input;
  const masterKey = process.env.MASTER_ENCRYPTION_KEY?.trim();
  const metaApiKey = process.env.META_API_KEY?.trim();
  if (masterKey && masterKey.length >= 8) {
    output = output.split(masterKey).join("[REDACTED_MASTER_KEY]");
  }
  if (metaApiKey && metaApiKey !== "mock" && metaApiKey.length >= 6) {
    output = output.split(metaApiKey).join("[REDACTED_API_KEY]");
  }
  output = output.replace(/Bearer\s+[A-Za-z0-9._\-+=]+/gi, "Bearer [REDACTED]");
  output = output.replace(/v1:[0-9a-fA-F]+:[0-9a-fA-F]+:[0-9a-fA-F]+/g, "v1:[REDACTED_CIPHERTEXT]");
  output = output.replace(/(https?|socks5):\/\/([^:\s/@]+):([^@\s/]+)@/gi, "$1://$2:[REDACTED]@");
  return output;
}

/**
 * Formats an encrypted proxy URL safely for UI display without exposing credentials.
 */
export function maskProxyDisplay(encryptedProxy: string | null | undefined): string {
  if (!encryptedProxy) {
    return "direct-local";
  }
  try {
    const raw = decryptSecret(encryptedProxy);
    const parsed = new URL(raw);
    const authLabel = parsed.username ? `${parsed.username}:****@` : "";
    return `${parsed.protocol}//${authLabel}${parsed.host}`;
  } catch {
    return "aes-256-gcm://encrypted";
  }
}
