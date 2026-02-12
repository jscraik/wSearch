import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "../src/crypto.js";

describe("crypto", () => {
  it("round-trips encryption", () => {
    const token = "secret-token";
    const passphrase = "passphrase-123";
    const encrypted = encryptToken(token, passphrase);
    const decrypted = decryptToken(encrypted, passphrase);
    expect(decrypted).toBe(token);
  });

  describe("authentication", () => {
    it("rejects tampered ciphertext", () => {
      const token = "secret-token";
      const passphrase = "passphrase-123";
      const encrypted = encryptToken(token, passphrase);

      // Tamper with ciphertext - flip first byte
      const ciphertextValue = encrypted.ciphertext!;
      const ciphertextBuf = Buffer.from(ciphertextValue, "base64");
      ciphertextBuf[0]! = ciphertextBuf[0]! ^ 0xFF;
      encrypted.ciphertext! = ciphertextBuf.toString("base64");

      expect(() => decryptToken(encrypted, passphrase))
        .toThrowError(/Failed to decrypt token/);
    });

    it("rejects tampered auth tag", () => {
      const token = "secret-token";
      const passphrase = "passphrase-123";
      const encrypted = encryptToken(token, passphrase);

      // Tamper with auth tag - flip first byte
      const tagValue = encrypted.tag!;
      const tagBuf = Buffer.from(tagValue, "base64");
      tagBuf[0]! = tagBuf[0]! ^ 0xFF;
      encrypted.tag! = tagBuf.toString("base64");

      expect(() => decryptToken(encrypted, passphrase))
        .toThrowError(/Failed to decrypt token/);
    });

    it("rejects wrong passphrase", () => {
      const token = "secret-token";
      const passphrase = "passphrase-123";
      const wrongPassphrase = "wrong-passphrase";
      const encrypted = encryptToken(token, passphrase);

      expect(() => decryptToken(encrypted, wrongPassphrase))
        .toThrowError(/Failed to decrypt token/);
    });
  });
});
