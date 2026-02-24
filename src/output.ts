import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { JsonEnvelope, LogLevel, OutputMode } from "./types.js";

export type Logger = {
  info: (msg: string) => void;
  verbose: (msg: string) => void;
  debug: (msg: string) => void;
  error: (msg: string) => void;
};

export function resolveOutputMode(json: boolean, plain: boolean): OutputMode {
  if (json && plain) {
    throw new Error("--json and --plain cannot be used together");
  }
  return json ? "json" : "plain";
}

export function createLogger(level: LogLevel): Logger {
  const shouldLog = (target: LogLevel) => {
    const rank: Record<LogLevel, number> = {
      quiet: 0,
      info: 1,
      verbose: 2,
      debug: 3,
    };
    return rank[level] >= rank[target] && level !== "quiet";
  };

  return {
    info: (msg) => {
      if (shouldLog("info")) process.stderr.write(`${msg}\n`);
    },
    verbose: (msg) => {
      if (shouldLog("verbose")) process.stderr.write(`${msg}\n`);
    },
    debug: (msg) => {
      if (shouldLog("debug")) process.stderr.write(`${msg}\n`);
    },
    error: (msg) => {
      process.stderr.write(`${msg}\n`);
    },
  };
}

export function envelope<T>(
  schema: string,
  summary: string,
  status: "success" | "warn" | "error",
  data: T,
  errors: Array<{ message: string; code?: string }> = [],
  requestId?: string,
): JsonEnvelope<T> {
  const version = resolveCliVersion();
  const meta = {
    tool: "wsearch",
    version,
    timestamp: new Date().toISOString(),
    ...(requestId !== undefined ? { request_id: requestId } : {}),
  };
  return {
    schema,
    meta,
    summary,
    status,
    data,
    errors,
  };
}

export function writeOutput(content: string, output?: string): void {
  if (!output || output === "-") {
    process.stdout.write(content);
    return;
  }
  const parent = path.dirname(output);
  if (parent && parent !== ".") {
    fs.mkdirSync(parent, { recursive: true });
  }
  // Ensure trailing newline for files
  const payload = content.endsWith("\n") ? content : `${content}\n`;
  fs.writeFileSync(output, payload, { encoding: "utf8" });
}

export function formatPlain(data: unknown): string {
  if (typeof data === "string") {
    return data.endsWith("\n") ? data : `${data}\n`;
  }
  return `${JSON.stringify(data, null, 2)}\n`;
}

let cachedVersion: string | null = null;

function resolveCliVersion(): string {
  if (cachedVersion) {
    return cachedVersion;
  }

  const envVersion = process.env.npm_package_version?.trim();
  if (envVersion) {
    cachedVersion = envVersion;
    return cachedVersion;
  }

  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const packagePath = path.resolve(here, "..", "package.json");
    const raw = fs.readFileSync(packagePath, "utf8");
    const parsed = JSON.parse(raw) as { version?: string };
    if (parsed.version && parsed.version.trim().length > 0) {
      cachedVersion = parsed.version.trim();
      return cachedVersion;
    }
  } catch (error) {
    // no-op: fall back to default version
  }

  cachedVersion = "0.0.0";
  return cachedVersion;
}
