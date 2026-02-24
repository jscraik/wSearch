import fs from "fs";
import os from "os";
import path from "path";

export type CredentialsFile = {
  version: 1;
  kdf: "scrypt";
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
};

export type ConfigFile = {
  profile?: string;
  userAgent?: string;
  apiUrl?: string;
  actionUrl?: string;
  sparqlUrl?: string;
  timeout?: number;
  retries?: number;
  retryBackoff?: number;
};

export function getConfigDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg && xdg.trim().length > 0) {
    return path.join(xdg, "wsearch-cli");
  }
  return path.join(os.homedir(), ".config", "wsearch-cli");
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), "config.json");
}

export function getCredentialsPath(): string {
  return path.join(getConfigDir(), "credentials.json");
}

export function ensureConfigDir(): void {
  const dir = getConfigDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  enforceModeBestEffort(dir, 0o700);
}

export function loadConfig(): ConfigFile {
  const file = getConfigPath();
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return validateConfigFile(parsed);
}

export function saveConfig(config: ConfigFile): void {
  ensureConfigDir();
  const file = getConfigPath();
  fs.writeFileSync(file, JSON.stringify(config, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  enforceModeBestEffort(file, 0o600);
}

export function loadCredentials(): CredentialsFile | null {
  const file = getCredentialsPath();
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return validateCredentialsFile(parsed);
}

export function saveCredentials(payload: CredentialsFile): void {
  ensureConfigDir();
  const file = getCredentialsPath();
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  enforceModeBestEffort(file, 0o600);
}

export function removeCredentials(): void {
  const file = getCredentialsPath();
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
}

function enforceModeBestEffort(target: string, mode: number): void {
  try {
    fs.chmodSync(target, mode);
  } catch (error) {
    // Best-effort hardening. Ignore platform/FS limitations.
  }
}

function validateConfigFile(value: unknown): ConfigFile {
  if (!isObjectRecord(value)) {
    throw new Error("Config file must be a JSON object.");
  }
  const config = value as Record<string, unknown>;
  const validated: ConfigFile = {};
  if (typeof config.profile !== "undefined") {
    validated.profile = expectString(config.profile, "profile");
  }
  if (typeof config.userAgent !== "undefined") {
    validated.userAgent = expectString(config.userAgent, "userAgent");
  }
  if (typeof config.apiUrl !== "undefined") {
    validated.apiUrl = expectString(config.apiUrl, "apiUrl");
  }
  if (typeof config.actionUrl !== "undefined") {
    validated.actionUrl = expectString(config.actionUrl, "actionUrl");
  }
  if (typeof config.sparqlUrl !== "undefined") {
    validated.sparqlUrl = expectString(config.sparqlUrl, "sparqlUrl");
  }
  if (typeof config.timeout !== "undefined") {
    validated.timeout = expectNumber(config.timeout, "timeout");
  }
  if (typeof config.retries !== "undefined") {
    validated.retries = expectNumber(config.retries, "retries");
  }
  if (typeof config.retryBackoff !== "undefined") {
    validated.retryBackoff = expectNumber(config.retryBackoff, "retryBackoff");
  }
  return validated;
}

function validateCredentialsFile(value: unknown): CredentialsFile {
  if (!isObjectRecord(value)) {
    throw new Error("Credentials file must be a JSON object.");
  }
  const payload = value as Record<string, unknown>;
  const version = payload.version;
  if (version !== 1) {
    throw new Error("Credentials version must be 1.");
  }
  const kdf = payload.kdf;
  if (kdf !== "scrypt") {
    throw new Error("Credentials kdf must be scrypt.");
  }
  return {
    version: 1,
    kdf: "scrypt",
    salt: expectString(payload.salt, "salt"),
    iv: expectString(payload.iv, "iv"),
    tag: expectString(payload.tag, "tag"),
    ciphertext: expectString(payload.ciphertext, "ciphertext")
  };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }
  return value;
}

function expectNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${field} must be a number.`);
  }
  return value;
}
