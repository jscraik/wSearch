import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureConfigDir, saveConfig, loadConfig, saveCredentials, loadCredentials } from "../src/config.js";

describe("config security", () => {
  let originalXdg: string | undefined;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-test-"));

  beforeEach(() => {
    originalXdg = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = tmpDir;
  });

  afterEach(() => {
    process.env.XDG_CONFIG_HOME = originalXdg;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("ensureConfigDir", () => {
    it("creates config directory with secure permissions", () => {
      ensureConfigDir();
      const dir = path.join(tmpDir, "wsearch-cli");
      const stats = fs.statSync(dir);
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o700);
    });

    it("detects insecure directory permissions", () => {
      const dir = path.join(tmpDir, "wsearch-cli");
      fs.mkdirSync(dir, { recursive: true, mode: 0o755 });

      expect(() => ensureConfigDir())
        .toThrowError(/insecure permissions/);
    });

    it("verifies directory ownership on Unix", () => {
      if (process.platform === "win32") {
        return;
      }

      const dir = path.join(tmpDir, "wsearch-cli");
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

      // This test assumes the current user owns the directory
      // (which should be true since we just created it)
      expect(() => ensureConfigDir()).not.toThrow();
    });
  });

  describe("saveConfig and loadConfig", () => {
    it("writes config file with secure permissions", () => {
      const config = { userAgent: "Test/1.0" };
      saveConfig(config);

      const file = path.join(tmpDir, "wsearch-cli", "config.json");
      const stats = fs.statSync(file);
      expect(stats.mode & 0o777).toBe(0o600);
    });

    it("writes config file atomically", () => {
      const config = { userAgent: "Test/1.0" };
      saveConfig(config);

      const loaded = loadConfig();
      expect(loaded).toEqual(config);
    });

    it("overwrites existing config atomically", () => {
      const config1 = { userAgent: "Test/1.0" };
      const config2 = { userAgent: "Test/2.0" };

      saveConfig(config1);
      saveConfig(config2);

      const loaded = loadConfig();
      expect(loaded).toEqual(config2);
    });
  });

  describe("saveCredentials and loadCredentials", () => {
    it("writes credentials file with secure permissions", () => {
      const creds = {
        version: 1 as const,
        kdf: "scrypt" as const,
        salt: "dGVzdHNhbHQ=",
        iv: "dGVzdGl2",
        tag: "dGVzdHRhZw==",
        ciphertext: "dGVzdGNpcGhlcg=="
      };

      saveCredentials(creds);

      const file = path.join(tmpDir, "wsearch-cli", "credentials.json");
      const stats = fs.statSync(file);
      expect(stats.mode & 0o777).toBe(0o600);
    });

    it("detects insecure credentials file permissions", () => {
      const dir = path.join(tmpDir, "wsearch-cli");
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

      const file = path.join(dir, "credentials.json");
      const creds = {
        version: 1 as const,
        kdf: "scrypt" as const,
        salt: "dGVzdHNhbHQ=",
        iv: "dGVzdGl2",
        tag: "dGVzdHRhZw==",
        ciphertext: "dGVzdGNpcGhlcg=="
      };

      // Write with insecure permissions
      fs.writeFileSync(file, JSON.stringify(creds, null, 2), {
        mode: 0o644
      });

      expect(() => loadCredentials())
        .toThrowError(/insecure permissions/);
    });

    it("returns null when credentials file does not exist", () => {
      const creds = loadCredentials();
      expect(creds).toBeNull();
    });

    it("round-trips credentials", () => {
      const creds = {
        version: 1 as const,
        kdf: "scrypt" as const,
        salt: "dGVzdHNhbHQ=",
        iv: "dGVzdGl2",
        tag: "dGVzdHRhZw==",
        ciphertext: "dGVzdGNpcGhlcg=="
      };

      saveCredentials(creds);
      const loaded = loadCredentials();

      expect(loaded).toEqual(creds);
    });
  });
});