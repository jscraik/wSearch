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
  
  // Try to create directory
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch (error) {
    const errno = (error as NodeJS.ErrnoException).code;
    // Ignore EEXIST - directory already exists, we'll verify permissions below
    if (errno !== "EEXIST") {
      throw error;
    }
  }
  
  // Always verify permissions and ownership (whether we just created it or it existed)
  const stats = fs.statSync(dir);
  const mode = stats.mode & 0o777;
  
  // Check for excessive permissions (group/other write/read)
  if (mode & 0o077) {
    throw new Error(
      `Config directory has insecure permissions (${mode.toString(8)}). ` +
      `Fix with: chmod 700 ${dir}`
    );
  }
  
  // Verify ownership (Unix only)
  if (process.platform !== "win32") {
    const uid = process.getuid?.();
    if (uid !== undefined && stats.uid !== uid) {
      throw new Error("Config directory not owned by current user");
    }
  }
}

export function loadConfig(): ConfigFile {
  const file = getConfigPath();
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, "utf8");
  return JSON.parse(raw) as ConfigFile;
}

export function saveConfig(config: ConfigFile): void {
  ensureConfigDir();
  const file = getConfigPath();

  // Atomic write pattern: write to temp file, then rename
  const tempFile = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(config, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });

  // Atomic rename overwrites target if it exists
  fs.renameSync(tempFile, file);
}

export function loadCredentials(): CredentialsFile | null {
  const file = getCredentialsPath();
  if (!fs.existsSync(file)) return null;

  // Verify file permissions
  const stats = fs.statSync(file);
  const mode = stats.mode & 0o777;
  if (mode !== 0o600) {
    throw new Error(
      `Credentials file has insecure permissions (${mode.toString(8)}). ` +
      `Fix with: chmod 600 ${file}`
    );
  }

  const raw = fs.readFileSync(file, "utf8");
  return JSON.parse(raw) as CredentialsFile;
}

export function saveCredentials(payload: CredentialsFile): void {
  ensureConfigDir();
  const file = getCredentialsPath();

  // Atomic write pattern: write to temp file, then rename
  const tempFile = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(payload, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });

  // Atomic rename overwrites target if it exists
  fs.renameSync(tempFile, file);
}

export function removeCredentials(): void {
  const file = getCredentialsPath();
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
}
