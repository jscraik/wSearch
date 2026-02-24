import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  saveConfig,
  saveCredentials,
  getConfigDir,
  getConfigPath,
  getCredentialsPath,
  loadConfig,
  loadCredentials
} from "../src/config.js";

describe("config file permissions", () => {
  it("enforces restrictive modes when saving config and credentials", () => {
    if (process.platform === "win32") {
      return;
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-perms-"));
    const previousXdg = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = tmpDir;

    const configDir = getConfigDir();
    fs.mkdirSync(configDir, { recursive: true, mode: 0o755 });
    const configPath = getConfigPath();
    const credentialsPath = getCredentialsPath();
    fs.writeFileSync(configPath, "{}", { encoding: "utf8", mode: 0o644 });
    fs.writeFileSync(
      credentialsPath,
      JSON.stringify({
        version: 1,
        kdf: "scrypt",
        salt: "salt",
        iv: "iv",
        tag: "tag",
        ciphertext: "cipher"
      }),
      { encoding: "utf8", mode: 0o644 }
    );

    fs.chmodSync(configDir, 0o755);
    fs.chmodSync(configPath, 0o644);
    fs.chmodSync(credentialsPath, 0o644);

    try {
      saveConfig({ userAgent: "Test/1.0" });
      saveCredentials({
        version: 1,
        kdf: "scrypt",
        salt: "salt",
        iv: "iv",
        tag: "tag",
        ciphertext: "cipher"
      });

      const dirMode = fs.statSync(configDir).mode & 0o777;
      const fileMode = fs.statSync(configPath).mode & 0o777;
      const credMode = fs.statSync(credentialsPath).mode & 0o777;

      expect(dirMode).toBe(0o700);
      expect(fileMode).toBe(0o600);
      expect(credMode).toBe(0o600);
    } finally {
      if (previousXdg === undefined) {
        delete process.env.XDG_CONFIG_HOME;
      } else {
        process.env.XDG_CONFIG_HOME = previousXdg;
      }
    }
  });
});

describe("config schema validation", () => {
  it("rejects non-object config files", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-config-"));
    const previousXdg = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = tmpDir;
    const configDir = getConfigDir();
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(getConfigPath(), "[]", "utf8");
    try {
      expect(() => loadConfig()).toThrow(/must be a JSON object/);
    } finally {
      if (previousXdg === undefined) {
        delete process.env.XDG_CONFIG_HOME;
      } else {
        process.env.XDG_CONFIG_HOME = previousXdg;
      }
    }
  });

  it("rejects structurally invalid credentials files", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-credentials-"));
    const previousXdg = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = tmpDir;
    const configDir = getConfigDir();
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(getCredentialsPath(), JSON.stringify({ foo: "bar" }), "utf8");
    try {
      expect(() => loadCredentials()).toThrow(/version must be 1/);
    } finally {
      if (previousXdg === undefined) {
        delete process.env.XDG_CONFIG_HOME;
      } else {
        process.env.XDG_CONFIG_HOME = previousXdg;
      }
    }
  });
});
