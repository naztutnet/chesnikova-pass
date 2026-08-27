import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function createPayloadCipher(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("Encryption key must be a 32-byte Buffer");
  return {
    encrypt(value) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return Buffer.concat([iv, tag, encrypted]).toString("base64");
    },
    decrypt(value) {
      const raw = Buffer.from(value, "base64");
      const iv = raw.subarray(0, 12);
      const tag = raw.subarray(12, 28);
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
      return JSON.parse(decrypted.toString("utf8"));
    },
  };
}
