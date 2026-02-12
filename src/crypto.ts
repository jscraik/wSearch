import crypto from "crypto";
import { CredentialsFile } from "./config.js";

const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BYTES = 32;

// Using Node.js default scrypt parameters (N=16384, r=8, p=1)
// Explicit options omitted due to OpenSSL memory limit constraints on some systems

export function encryptToken(token: string, passphrase: string): CredentialsFile {
  const salt = crypto.randomBytes(SALT_BYTES);
  const iv = crypto.randomBytes(IV_BYTES);
  const key = crypto.scryptSync(passphrase, salt, KEY_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    version: 1,
    kdf: "scrypt",
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64")
  };
}

export function decryptToken(payload: CredentialsFile, passphrase: string): string {
  if (payload.version !== 1 || payload.kdf !== "scrypt") {
    throw new Error("Unsupported credentials format");
  }
  const salt = Buffer.from(payload.salt, "base64");
  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const ciphertext = Buffer.from(payload.ciphertext, "base64");
  const key = crypto.scryptSync(passphrase, salt, KEY_BYTES);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);

  try {
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
  } catch (error) {
    // Authentication failure - tag didn't match
    throw new Error("Failed to decrypt token. Invalid ciphertext or wrong passphrase.");
  }
}
