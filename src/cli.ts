#!/usr/bin/env node
import yargs from "yargs";
import type { Argv, Arguments } from "yargs";
import { hideBin } from "yargs/helpers";
import { createLogger, envelope, formatPlain, resolveOutputMode, writeOutput } from "./output.js";
import { CliGlobals } from "./types.js";
import { actionSearch, apiPathUrl, entityPath, getEntity, getStatements, rawRequest, sparqlQuery } from "./wikidata.js";
import { readFile, readStdin, promptHidden, promptText } from "./io.js";
import { decryptToken, encryptToken } from "./crypto.js";
import { getConfigPath, loadConfig, removeCredentials, saveConfig, saveCredentials, loadCredentials } from "./config.js";
import { CliError } from "./cli-errors.js";
import { getErrorHelp, formatAgentError } from "./agent.js";

const DEFAULT_API_URL = "https://www.wikidata.org/w/rest.php/wikibase/v1";
const DEFAULT_ACTION_URL = "https://www.wikidata.org/w/api.php";
const DEFAULT_SPARQL_URL = "https://query.wikidata.org/sparql";
const MAX_TIMER_MS = 2_147_483_647;

type RequestPreview = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
};

type ConfigKeySpec = {
  field:
    | "userAgent"
    | "apiUrl"
    | "actionUrl"
    | "sparqlUrl"
    | "timeout"
    | "retries"
    | "retryBackoff";
  type: "string" | "number";
};

const CONFIG_KEYS: Record<string, ConfigKeySpec> = {
  "user-agent": { field: "userAgent", type: "string" },
  "api-url": { field: "apiUrl", type: "string" },
  "action-url": { field: "actionUrl", type: "string" },
  "sparql-url": { field: "sparqlUrl", type: "string" },
  timeout: { field: "timeout", type: "number" },
  retries: { field: "retries", type: "number" },
  "retry-backoff": { field: "retryBackoff", type: "number" }
};

function resolveLogLevel(args: CliGlobals): "quiet" | "info" | "verbose" | "debug" {
  if (args.debug) return "debug";
  if (args.verbose) return "verbose";
  if (args.quiet) return "quiet";
  return "info";
}

function requireNetwork(args: CliGlobals): void {
  if (!args.network) {
    throw new CliError("Network access is disabled. Re-run with --network.", 3, "E_POLICY");
  }
}

function resolveUserAgent(args: CliGlobals, required: boolean): string | undefined {
  const ua = args.userAgent ?? process.env.WIKI_USER_AGENT;
  if (required && (!ua || ua.trim().length === 0)) {
    throw new CliError("User-Agent is required. Provide --user-agent or WIKI_USER_AGENT.", 3, "E_POLICY");
  }
  return ua?.trim();
}

function resolveOutput(args: CliGlobals): { mode: "plain" | "json" } {
  return { mode: resolveOutputMode(args.json, args.plain) };
}

function readFileOrThrow(filePath: string, purpose: string): string {
  try {
    return readFile(filePath);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new CliError(`Failed to read ${purpose} file "${filePath}": ${detail}`, 1, "E_IO");
  }
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNodeIoError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  );
}

function runIoOrThrow(action: () => void, context: string): void {
  try {
    action();
  } catch (error) {
    throw new CliError(`Failed to ${context}: ${errorDetail(error)}`, 1, "E_IO");
  }
}

function getHeaders(userAgent?: string): HeadersInit {
  const headers: Record<string, string> = {
    accept: "application/json"
  };
  if (userAgent) {
    headers["user-agent"] = userAgent;
  }
  return headers;
}

function loadConfigSafe() {
  try {
    return loadConfig();
  } catch (error) {
    const isValidationError =
      error instanceof Error &&
      (error.message === "Config file must be a JSON object." || error.message.includes("must be a "));
    if (isValidationError) {
      throw new CliError(
        `Invalid config file at ${getConfigPath()}: ${error.message}`,
        2,
        "E_VALIDATION"
      );
    }
    if (isNodeIoError(error)) {
      throw new CliError(
        `Failed to read config file at ${getConfigPath()}: ${errorDetail(error)}`,
        1,
        "E_IO"
      );
    }
    throw new CliError(
      `Failed to read config file at ${getConfigPath()}. Fix or delete it and retry.`,
      1,
      "E_INTERNAL"
    );
  }
}

function loadCredentialsState(): { credentials: ReturnType<typeof loadCredentials>; readable: boolean } {
  try {
    return { credentials: loadCredentials(), readable: true };
  } catch (_error) {
    return { credentials: null, readable: false };
  }
}

function loadConfigDefaults(): Partial<CliGlobals> {
  const config = loadConfigSafe();
  const defaults: Partial<CliGlobals> = {};
  if (typeof config.userAgent !== "undefined") {
    defaults.userAgent = assertString("Config user-agent", config.userAgent);
  }
  if (config.apiUrl) {
    const value = assertString("Config api-url", config.apiUrl);
    assertHttpUrl("api-url", value);
    defaults.apiUrl = value;
  }
  if (config.actionUrl) {
    const value = assertString("Config action-url", config.actionUrl);
    assertHttpUrl("action-url", value);
    defaults.actionUrl = value;
  }
  if (config.sparqlUrl) {
    const value = assertString("Config sparql-url", config.sparqlUrl);
    assertHttpUrl("sparql-url", value);
    defaults.sparqlUrl = value;
  }
  if (typeof config.timeout !== "undefined") {
    if (typeof config.timeout !== "number" || Number.isNaN(config.timeout)) {
      throw new CliError("Config timeout must be a valid number.", 2, "E_VALIDATION");
    }
    assertNumber("timeout", config.timeout, { min: 1, max: MAX_TIMER_MS, integer: true });
    defaults.timeout = config.timeout;
  }
  if (typeof config.retries !== "undefined") {
    if (typeof config.retries !== "number" || Number.isNaN(config.retries)) {
      throw new CliError("Config retries must be a valid number.", 2, "E_VALIDATION");
    }
    assertNumber("retries", config.retries, { min: 0, integer: true });
    defaults.retries = config.retries;
  }
  if (typeof config.retryBackoff !== "undefined") {
    if (typeof config.retryBackoff !== "number" || Number.isNaN(config.retryBackoff)) {
      throw new CliError("Config retry-backoff must be a valid number.", 2, "E_VALIDATION");
    }
    assertNumber("retry-backoff", config.retryBackoff, { min: 0, max: MAX_TIMER_MS, integer: true });
    defaults.retryBackoff = config.retryBackoff;
  }
  return defaults;
}

function loadEnvOverrides(): Partial<CliGlobals> {
  const overrides: Partial<CliGlobals> = {};
  const env = process.env;
  if (env.WIKI_USER_AGENT) overrides.userAgent = env.WIKI_USER_AGENT;
  if (env.WIKI_API_URL && env.WIKI_API_URL.trim().length > 0) overrides.apiUrl = env.WIKI_API_URL;
  if (env.WIKI_ACTION_URL && env.WIKI_ACTION_URL.trim().length > 0) overrides.actionUrl = env.WIKI_ACTION_URL;
  if (env.WIKI_SPARQL_URL && env.WIKI_SPARQL_URL.trim().length > 0) overrides.sparqlUrl = env.WIKI_SPARQL_URL;
  if (typeof env.WIKI_TIMEOUT !== "undefined" && env.WIKI_TIMEOUT.trim().length > 0) {
    const value = Number(env.WIKI_TIMEOUT);
    try {
      assertNumber("timeout", value, { min: 1, integer: true });
      overrides.timeout = value;
    } catch (error) {
      throw new CliError(
        `Environment variable WIKI_TIMEOUT must be a positive integer: ${env.WIKI_TIMEOUT}`,
        2,
        "E_VALIDATION"
      );
    }
  }
  if (typeof env.WIKI_RETRIES !== "undefined" && env.WIKI_RETRIES.trim().length > 0) {
    const value = Number(env.WIKI_RETRIES);
    try {
      assertNumber("retries", value, { min: 0, integer: true });
      overrides.retries = value;
    } catch (error) {
      throw new CliError(
        `Environment variable WIKI_RETRIES must be a non-negative integer: ${env.WIKI_RETRIES}`,
        2,
        "E_VALIDATION"
      );
    }
  }
  if (typeof env.WIKI_RETRY_BACKOFF !== "undefined" && env.WIKI_RETRY_BACKOFF.trim().length > 0) {
    const value = Number(env.WIKI_RETRY_BACKOFF);
    try {
      assertNumber("retry-backoff", value, { min: 0, integer: true });
      overrides.retryBackoff = value;
    } catch (error) {
      throw new CliError(
        `Environment variable WIKI_RETRY_BACKOFF must be a non-negative integer: ${env.WIKI_RETRY_BACKOFF}`,
        2,
        "E_VALIDATION"
      );
    }
  }
  return overrides;
}

function resolveConfigKey(key: string): ConfigKeySpec {
  const normalized = key.trim().toLowerCase();
  const entry = CONFIG_KEYS[normalized];
  if (!entry) {
    const allowed = Object.keys(CONFIG_KEYS).sort().join(", ");
    throw new CliError(`Unknown config key "${key}". Allowed keys: ${allowed}.`, 2, "E_USAGE");
  }
  return entry;
}

function parseConfigValue(entry: ConfigKeySpec, raw: string): string | number | undefined {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "none" || trimmed.toLowerCase() === "null") {
    return undefined;
  }
  if (entry.type === "number") {
    const value = Number(trimmed);
    if (!Number.isFinite(value)) {
      throw new CliError(`Invalid value for ${entry.field}: "${raw}"`, 2, "E_VALIDATION");
    }
    return value;
  }
  return trimmed;
}

function normalizeHeaders(headers: HeadersInit): Record<string, string> {
  const normalized: Record<string, string> = {};
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      normalized[key] = value;
    });
    return normalized;
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      normalized[key] = value;
    }
    return normalized;
  }
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value !== "undefined") {
      normalized[key] = String(value);
    }
  }
  return normalized;
}

function redactHeaders(headers: HeadersInit): Record<string, string> {
  const normalized = normalizeHeaders(headers);
  for (const key of Object.keys(normalized)) {
    const lower = key.toLowerCase();
    if (lower === "authorization" || lower === "cookie") {
      normalized[key] = "<redacted>";
    }
  }
  return normalized;
}

function outputRequestPreview(args: CliGlobals, summary: string, preview: RequestPreview): void {
  outputResult(args, "wiki.request.preview.v1", summary, preview);
}

function readNonFlagValue(argv: string[], index: number): string | undefined {
  const candidate = argv[index + 1];
  if (!candidate || candidate.startsWith("-")) {
    return undefined;
  }
  return candidate;
}

function parseRequestIdFromArgv(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg === "--request-id") {
      const value = readNonFlagValue(argv, i);
      if (value) {
        return value;
      }
      continue;
    }
    if (arg.startsWith("--request-id=")) {
      const value = arg.split("=", 2)[1];
      if (value) return value;
    }
  }
  return undefined;
}

function resolveErrorContext(): { mode: "plain" | "json"; output?: string; requestId?: string; agent?: boolean } {
  const fallback = parseOutputArgsFromArgv(hideBin(process.argv));
  const requestId = lastKnownArgs.requestId ?? parseRequestIdFromArgv(hideBin(process.argv));
  const json = Boolean(lastKnownArgs.json ?? fallback.json);
  const output = lastKnownArgs.output ?? fallback.output;
  const agent = Boolean(lastKnownArgs.agent) || hideBin(process.argv).includes("--agent");
  const context: { mode: "plain" | "json"; output?: string; requestId?: string; agent?: boolean } = json
    ? { mode: "json", agent }
    : { mode: "plain", agent };
  if (json && output) {
    context.output = output;
  }
  if (requestId) {
    context.requestId = requestId;
  }
  return context;
}

function assertNumber(
  name: string,
  value: number,
  options: { min?: number; max?: number; integer?: boolean }
): void {
  if (!Number.isFinite(value)) {
    throw new CliError(`${name} must be a finite number.`, 2, "E_VALIDATION");
  }
  if (options.integer && !Number.isInteger(value)) {
    throw new CliError(`${name} must be an integer.`, 2, "E_VALIDATION");
  }
  if (options.min !== undefined && value < options.min) {
    throw new CliError(`${name} must be >= ${options.min}.`, 2, "E_VALIDATION");
  }
  if (options.max !== undefined && value > options.max) {
    throw new CliError(`${name} must be <= ${options.max}.`, 2, "E_VALIDATION");
  }
}

function assertHttpUrl(name: string, value: string): void {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Unsupported protocol");
    }
  } catch (_error) {
    throw new CliError(`${name} must be a valid http(s) URL.`, 2, "E_VALIDATION");
  }
}

function assertString(name: string, value: unknown): string {
  if (typeof value !== "string") {
    throw new CliError(`${name} must be a string.`, 2, "E_VALIDATION");
  }
  return value;
}

function resolveEnvVarName(optionFlag: string, providedName: string | undefined, fallbackName: string): {
  name: string;
  explicit: boolean;
} {
  if (typeof providedName === "undefined") {
    return { name: fallbackName, explicit: false };
  }
  const normalized = providedName.trim();
  if (normalized.length === 0) {
    throw new CliError(`${optionFlag} requires a non-empty environment variable name.`, 2, "E_USAGE");
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized)) {
    throw new CliError(`${optionFlag} must be a valid environment variable name.`, 2, "E_USAGE");
  }
  return { name: normalized, explicit: true };
}

function assertEntityId(id: string): string {
  const trimmed = id.trim();
  // Support flexible formats in agent mode: q42, Q42, q-42, etc.
  const flexibleMatch = trimmed.match(/^([qpl])[\s\-._]*([\d]+)$/i);
  if (flexibleMatch?.[1] && flexibleMatch?.[2]) {
    return flexibleMatch[1].toUpperCase() + flexibleMatch[2];
  }
  // Strict format check
  if (!/^[QPL]\d+$/.test(trimmed.toUpperCase())) {
    throw new CliError(`Invalid entity id "${id}". Expected Q*, P*, or L* id format.`, 2, "E_USAGE");
  }
  return trimmed.toUpperCase();
}

function assertHttpMethod(method: string): string {
  const normalized = method.trim().toUpperCase();
  if (!/^[!#$%&'*+.^_`|~0-9A-Z-]+$/.test(normalized)) {
    throw new CliError(`Invalid HTTP method "${method}".`, 2, "E_USAGE");
  }
  return normalized;
}

function assertApiRelativePath(pathValue: string): string {
  if (!pathValue.startsWith("/")) {
    throw new CliError("Path must start with '/'.", 2, "E_USAGE");
  }
  const pathOnly = pathValue.split(/[?#]/, 1)[0] ?? "";
  const segments = pathOnly.split("/").filter((segment) => segment.length > 0);
  for (const rawSegment of segments) {
    let decoded = rawSegment;
    try {
      decoded = decodeURIComponent(rawSegment);
    } catch (_error) {
      // Keep raw segment when decoding fails; traversal check still applies to raw text.
    }
    if (decoded === "." || decoded === "..") {
      throw new CliError("Path must not contain traversal segments ('.' or '..').", 2, "E_USAGE");
    }
    if (decoded.includes("/") || decoded.includes("\\")) {
      throw new CliError("Path must not contain encoded path separators.", 2, "E_USAGE");
    }
  }
  return pathValue;
}

async function resolveAuthHeader(args: CliGlobals, mode: "preview" | "request"): Promise<HeadersInit> {
  if (!args.auth) return {};
  const state = loadCredentialsState();
  if (!state.readable) {
    throw new CliError(
      "Stored credentials are unreadable. Run `wsearch auth logout` then `wsearch auth login`.",
      3,
      "E_AUTH"
    );
  }
  const stored = state.credentials;
  if (!stored) {
    throw new CliError("No stored token found. Run `wsearch auth login` first.", 3, "E_AUTH");
  }
  if (mode === "preview") {
    return { authorization: "Bearer <redacted>" };
  }
  const passphrase = await resolvePassphrase({
    nonInteractive: args.nonInteractive,
    confirm: false,
    ...(typeof args.passphraseFile !== "undefined" ? { passphraseFile: args.passphraseFile } : {}),
    ...(args.passphraseStdin ? { passphraseStdin: args.passphraseStdin } : {}),
    ...(typeof args.passphraseEnv !== "undefined" ? { passphraseEnv: args.passphraseEnv } : {})
  });
  let token: string;
  try {
    token = decryptToken(stored, passphrase);
  } catch (error) {
    throw new CliError("Failed to decrypt token. Check your passphrase.", 3, "E_AUTH");
  }
  return { authorization: `Bearer ${token}` };
}

function outputResult<T>(
  args: CliGlobals,
  schema: string,
  summary: string,
  data: T,
  status: "success" | "warn" | "error" = "success"
): void {
  const mode = resolveOutput(args).mode;
  if (mode === "json") {
    const payload = envelope(schema, summary, status, data, [], args.requestId);
    writeOutputOrThrow(`${JSON.stringify(payload)}\n`, args.output);
  } else {
    writeOutputOrThrow(formatPlain(data), args.output);
  }
}

async function resolveQueryInput({ query, file }: { query?: string; file?: string }, nonInteractive: boolean) {
  if (typeof query !== "undefined" && typeof file !== "undefined") {
    throw new CliError("Provide only one query source: --query or --file.", 2, "E_USAGE");
  }
  if (typeof query !== "undefined") {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length === 0) {
      throw new CliError("Query input required. Provided --query was empty.", 2, "E_USAGE");
    }
    return normalizedQuery;
  }
  if (typeof file !== "undefined") {
    if (file.trim().length === 0) {
      throw new CliError("--file requires a non-empty file path.", 2, "E_USAGE");
    }
    return readFileOrThrow(file, "query");
  }
  if (!process.stdin.isTTY) {
    const stdinQuery = (await readStdin()).trim();
    if (stdinQuery.length === 0) {
      throw new CliError("Query input required. Provide --query, --file, or stdin.", 2, "E_USAGE");
    }
    return stdinQuery;
  }
  if (nonInteractive) {
    throw new CliError("Query input required. Provide --query, --file, or stdin.", 2, "E_USAGE");
  }
  return promptText("SPARQL query: ");
}

async function resolveTokenInput(
  tokenFile: string | undefined,
  tokenStdin: boolean,
  tokenEnv: string | undefined,
  nonInteractive: boolean
): Promise<string> {
  const configuredSources = [
    typeof tokenFile !== "undefined",
    tokenStdin,
    typeof tokenEnv !== "undefined"
  ].filter(Boolean).length;
  if (configuredSources > 1) {
    throw new CliError(
      "Provide only one token source: --token-file, --token-stdin, or --token-env.",
      2,
      "E_USAGE"
    );
  }
  if (typeof tokenFile !== "undefined") {
    const tokenPath = tokenFile;
    if (tokenPath.trim().length === 0) {
      throw new CliError("--token-file requires a non-empty file path.", 2, "E_USAGE");
    }
    const tokenFromFile = readFileOrThrow(tokenPath, "token").trim();
    if (tokenFromFile.length === 0) {
      throw new CliError("Token input required. Provided --token-file was empty.", 2, "E_USAGE");
    }
    return tokenFromFile;
  }
  if (tokenStdin) {
    const tokenFromStdin = (await readStdin()).trim();
    if (tokenFromStdin.length === 0) {
      throw new CliError("Token input required. Provided --token-stdin was empty.", 2, "E_USAGE");
    }
    return tokenFromStdin;
  }
  const { name: envName, explicit: explicitTokenEnv } = resolveEnvVarName("--token-env", tokenEnv, "WIKI_TOKEN");
  const envToken = process.env[envName];
  if (envToken && envToken.trim().length > 0) return envToken.trim();
  if (explicitTokenEnv) {
    throw new CliError(
      `Token input required. Environment variable ${envName} is not set or empty.`,
      2,
      "E_USAGE"
    );
  }
  if (process.stdin.isTTY) {
    if (nonInteractive) {
      throw new Error(
        "Token input required. Provide --token-file, --token-stdin, or --token-env (or set WIKI_TOKEN)."
      );
    }
    const promptedToken = await promptHidden("Paste OAuth token: ");
    if (promptedToken.trim().length === 0) {
      throw new CliError(
        "Token input required. Provide --token-file, --token-stdin, or --token-env (or set WIKI_TOKEN).",
        2,
        "E_USAGE"
      );
    }
    return promptedToken;
  }
  throw new CliError(
    "Token input required. Provide --token-file, --token-stdin, or --token-env (or set WIKI_TOKEN).",
    2,
    "E_USAGE"
  );
}

function validatePassphrase(passphrase: string): void {
  if (passphrase.length < 8) {
    throw new Error("Passphrase must be at least 8 characters long.");
  }
}

async function resolvePassphrase(options: {
  nonInteractive: boolean;
  confirm: boolean;
  passphraseFile?: string;
  passphraseStdin?: boolean;
  passphraseEnv?: string;
}): Promise<string> {
  const configuredSources = [
    typeof options.passphraseFile !== "undefined",
    Boolean(options.passphraseStdin),
    typeof options.passphraseEnv !== "undefined"
  ].filter(Boolean).length;
  if (configuredSources > 1) {
    throw new CliError(
      "Provide only one passphrase source: --passphrase-file, --passphrase-stdin, or --passphrase-env.",
      2,
      "E_USAGE"
    );
  }
  if (typeof options.passphraseFile !== "undefined") {
    if (options.passphraseFile.trim().length === 0) {
      throw new CliError("--passphrase-file requires a non-empty file path.", 2, "E_USAGE");
    }
    const passphrase = readFile(options.passphraseFile).trim();
    validatePassphrase(passphrase);
    return passphrase;
  }
  if (options.passphraseStdin) {
    const stdinPassphrase = (await readStdin()).trim();
    if (stdinPassphrase.length === 0) {
      throw new CliError(
        "Passphrase input required. Provide --passphrase-file, --passphrase-stdin, or --passphrase-env (or set WIKI_PASSPHRASE).",
        2,
        "E_USAGE"
      );
    }
    const passphrase = stdinPassphrase;
    validatePassphrase(passphrase);
    return passphrase;
  }
  const { name: envName, explicit: explicitPassphraseEnv } = resolveEnvVarName(
    "--passphrase-env",
    options.passphraseEnv,
    "WIKI_PASSPHRASE"
  );
  const envValue = process.env[envName];
  if (envValue && envValue.trim().length > 0) {
    const passphrase = envValue.trim();
    validatePassphrase(passphrase);
    return passphrase;
  }
  if (explicitPassphraseEnv) {
    throw new CliError(
      `Passphrase input required. Environment variable ${envName} is not set or empty.`,
      2,
      "E_USAGE"
    );
  }
  if (!process.stdin.isTTY) {
    throw new CliError(
      "Passphrase input required. Provide --passphrase-file, --passphrase-stdin, or --passphrase-env (or set WIKI_PASSPHRASE).",
      2,
      "E_USAGE"
    );
  }
  if (options.nonInteractive) {
    throw new Error("Passphrase required. Run without --non-interactive.");
  }

  const passphrase = await promptHidden("Passphrase: ");
  validatePassphrase(passphrase);
  if (options.confirm) {
    const confirmValue = await promptHidden("Confirm passphrase: ");
    if (passphrase !== confirmValue) {
      throw new CliError("Passphrases do not match.", 2, "E_USAGE");
    }
  }
  return passphrase;
}

let configDefaults: Partial<CliGlobals> = {};
let envOverrides: Partial<CliGlobals> = {};
let configLoadError: CliError | null = null;
let envLoadError: CliError | null = null;
try {
  configDefaults = loadConfigDefaults();
} catch (error) {
  configLoadError =
    error instanceof CliError
      ? error
      : new CliError("Failed to read config file. Fix or delete it and retry.", 1, "E_INTERNAL");
}
try {
  envOverrides = loadEnvOverrides();
} catch (error) {
  envLoadError =
    error instanceof CliError
      ? error
      : new CliError("Invalid environment configuration. Fix and retry.", 2, "E_VALIDATION");
}
const mergedDefaults: Partial<CliGlobals> = { ...configDefaults, ...envOverrides };
const cli = yargs(hideBin(process.argv));

let lastKnownArgs: Partial<CliGlobals> = {};

function parseOutputArgsFromArgv(argv: string[]): { json: boolean; plain: boolean; output?: string } {
  const result: { json: boolean; plain: boolean; output?: string } = { json: false, plain: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg === "--json") {
      result.json = true;
    } else if (arg === "--plain") {
      result.plain = true;
    } else if (arg === "--output") {
      const value = readNonFlagValue(argv, i);
      if (value) {
        result.output = value;
        i += 1;
      }
    } else if (arg === "-o") {
      const value = readNonFlagValue(argv, i);
      if (value) {
        result.output = value;
        i += 1;
      }
    } else if (arg.startsWith("-o=")) {
      const value = arg.slice(3);
      if (value) {
        result.output = value;
      }
    } else if (arg.startsWith("-o") && arg.length > 2) {
      const value = arg.slice(2);
      if (value) {
        result.output = value;
      }
    } else if (arg.startsWith("--output=")) {
      const value = arg.split("=", 2)[1];
      if (value) {
        result.output = value;
      }
    }
  }
  return result;
}

function extractPositionalsFromArgv(argv: string[]): string[] {
  const positionals: string[] = [];
  const optionsWithValue = new Set<string>([
    "--output",
    "-o",
    "--request-id",
    "--passphrase-file",
    "--passphrase-env",
    "--user-agent",
    "--api-url",
    "--action-url",
    "--sparql-url",
    "--timeout",
    "--retries",
    "--retry-backoff",
    "--token-file",
    "--token-env",
    "--query",
    "--file",
    "--format",
    "--language",
    "--limit",
    "--body-file"
  ]);
  const shortBooleanOptions = new Set<string>(["-q", "-v", "-h", "-V"]);
  const longBooleanOptions = new Set<string>([
    "--json",
    "--plain",
    "--quiet",
    "--verbose",
    "--debug",
    "--input",
    "--no-input",
    "--network",
    "--auth",
    "--no-color",
    "--print-request",
    "--passphrase-stdin",
    "--token-stdin",
    "--help",
    "--version"
  ]);

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith("--")) {
      const eqIndex = arg.indexOf("=");
      const flag = eqIndex >= 0 ? arg.slice(0, eqIndex) : arg;
      if (optionsWithValue.has(flag)) {
        if (eqIndex < 0 && i + 1 < argv.length) {
          i += 1;
        }
        continue;
      }
      if (longBooleanOptions.has(flag)) {
        continue;
      }
      continue;
    }
    if (arg.startsWith("-")) {
      if (shortBooleanOptions.has(arg)) {
        continue;
      }
      if (arg === "-o") {
        if (i + 1 < argv.length) {
          i += 1;
        }
        continue;
      }
      if (arg.startsWith("-o=") || (arg.startsWith("-o") && arg.length > 2)) {
        continue;
      }
      continue;
    }
    positionals.push(arg);
  }

  return positionals;
}

function isUnknownCommandWithTrailingHelp(argv: string[]): boolean {
  const positionals = extractPositionalsFromArgv(argv);
  if (positionals.length < 2) return false;
  const knownTopLevel = new Set([
    "help",
    "config",
    "auth",
    "entity",
    "sparql",
    "action",
    "raw",
    "doctor",
    "completion"
  ]);
  const first = positionals[0];
  if (!first) return false;
  if (knownTopLevel.has(first)) return false;
  return positionals.slice(1).includes("help");
}

function isHelpLikeInvocation(argv: string[]): boolean {
  if (argv.includes("--help") || argv.includes("-h") || argv.includes("--version") || argv.includes("-V")) {
    return true;
  }
  const optionsWithValue = new Set<string>([
    "--output",
    "-o",
    "--request-id",
    "--passphrase-file",
    "--passphrase-env",
    "--user-agent",
    "--api-url",
    "--action-url",
    "--sparql-url",
    "--timeout",
    "--retries",
    "--retry-backoff",
    "--token-file",
    "--token-env",
  ]);
  const booleanOptions = new Set<string>([
    "--json",
    "--plain",
    "-q",
    "--quiet",
    "-v",
    "--verbose",
    "--debug",
    "--input",
    "--no-input",
    "--network",
    "--auth",
    "--no-color",
    "--print-request",
    "--passphrase-stdin",
  ]);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg === "--") {
      return argv[i + 1] === "help";
    }
    if (optionsWithValue.has(arg)) {
      if (i + 1 < argv.length) {
        i += 1;
      }
      continue;
    }
    if (arg.startsWith("--")) {
      const eqIndex = arg.indexOf("=");
      const flag = eqIndex >= 0 ? arg.slice(0, eqIndex) : arg;
      if (optionsWithValue.has(flag) || booleanOptions.has(flag)) {
        continue;
      }
      return false;
    }
    if (arg.startsWith("-")) {
      if (arg.startsWith("-o") && arg.length > 2) {
        continue;
      }
      if (booleanOptions.has(arg)) {
        continue;
      }
      return false;
    }
    return arg === "help";
  }
  return false;
}

function exitWithStartupError(error: CliError): never {
  const argv = hideBin(process.argv);
  const outputArgs = parseOutputArgsFromArgv(argv);
  const requestId = parseRequestIdFromArgv(argv);
  if (outputArgs.json) {
    const payload = envelope("wiki.error.v1", error.message, "error", null, [{ message: error.message, code: error.code }], requestId);
    try {
      writeOutput(`${JSON.stringify(payload)}\n`, outputArgs.output);
    } catch (_outputError) {
      process.stdout.write(`${JSON.stringify(payload)}\n`);
    }
    process.exit(error.exitCode);
  }
  process.stderr.write(`${error.message}\n`);
  process.exit(error.exitCode);
}

function writeOutputOrThrow(content: string, output?: string): void {
  try {
    writeOutput(content, output);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    emitUnhandledCliError(new CliError(`Failed to write output: ${detail}`, 1, "E_IO"));
  }
}

function emitUnhandledCliError(error: unknown): never {
  const resolved =
    error instanceof CliError
      ? error
      : new CliError(error instanceof Error ? error.message : "Unexpected error", 1, "E_INTERNAL");
  const { mode, output, requestId, agent } = resolveErrorContext();
  if (agent) {
    const help = getErrorHelp(resolved.code, resolved.message);
    process.stderr.write(`${formatAgentError(help, true)}\n`);
    process.exit(resolved.exitCode);
  }
  if (mode === "json") {
    const payload = envelope(
      "wiki.error.v1",
      resolved.message,
      "error",
      null,
      [{ message: resolved.message, code: resolved.code }],
      requestId
    );
    try {
      writeOutput(`${JSON.stringify(payload)}\n`, output);
    } catch (_outputError) {
      process.stdout.write(`${JSON.stringify(payload)}\n`);
    }
    process.exit(resolved.exitCode);
  }
  process.stderr.write(`${resolved.message}\n`);
  process.exit(resolved.exitCode);
}

const startupArgv = hideBin(process.argv);
const isHelpLike = isHelpLikeInvocation(startupArgv);
const hasUnknownTrailingHelp = isUnknownCommandWithTrailingHelp(startupArgv);

if (hasUnknownTrailingHelp) {
  const positionals = extractPositionalsFromArgv(startupArgv);
  const first = positionals[0] ?? "unknown";
  exitWithStartupError(new CliError(`Unknown argument: ${first}`, 2, "E_USAGE"));
}

if (configLoadError && !isHelpLike) {
  exitWithStartupError(configLoadError);
}
if (envLoadError && !isHelpLike) {
  exitWithStartupError(envLoadError);
}

cli
  .scriptName("wsearch")
  .usage("wsearch [global flags] <subcommand> [args]")
  .example("wsearch --network --user-agent \"MyApp/1.0 (https://example.org/contact)\" entity get Q42", "")
  .example("wsearch --network sparql query --file ./query.rq --format json", "")
  .example("wsearch --network action search --query \"New York\" --language en --limit 5", "")
  .example("wsearch auth login --token-stdin < token.txt", "")
  .config(mergedDefaults)
  .middleware((args: Arguments) => {
    lastKnownArgs = args as unknown as CliGlobals;
    const inputFlag = (args as Arguments & { input?: boolean }).input;
    if (typeof inputFlag === "boolean") {
      args.nonInteractive = !inputFlag;
    }
    if (typeof args.output === "string" && args.output.trim().length === 0) {
      throw new CliError("--output requires a non-empty file path.", 2, "E_USAGE");
    }
    if (typeof args.requestId === "string" && args.requestId.trim().length === 0) {
      throw new CliError("--request-id requires a non-empty value.", 2, "E_USAGE");
    }
    if (args.help || isHelpLike) return;
    if (args.json && args.plain) {
      throw new CliError("--json and --plain cannot be used together", 2, "E_USAGE");
    }
  })
  .option("json", { type: "boolean", default: false, describe: "Output machine-readable JSON" })
  .option("plain", { type: "boolean", default: false, describe: "Output stable plain text" })
  .option("output", { type: "string", alias: "o", describe: "Write output to file (use - for stdout)" })
  .option("quiet", { type: "boolean", default: false, alias: "q" })
  .option("verbose", { type: "boolean", default: false, alias: "v" })
  .option("debug", { type: "boolean", default: false })
  .option("input", { type: "boolean", default: true, describe: "Enable interactive prompts" })
  .option("non-interactive", { type: "boolean", default: false, describe: "Disable prompts (non-interactive mode)" })
  .option("agent", { type: "boolean", default: false, describe: "Agent mode: flexible parsing, detailed error help" })
  .option("network", { type: "boolean", default: false, describe: "Allow network access" })
  .option("auth", { type: "boolean", default: false, describe: "Use stored token for Authorization" })
  .option("no-color", { type: "boolean", default: false, describe: "Disable color output" })
  .option("request-id", { type: "string", describe: "Attach a request id to JSON output" })
  .option("print-request", { type: "boolean", default: false, describe: "Print request preview and exit" })
  .option("passphrase-file", { type: "string", describe: "Read passphrase from file" })
  .option("passphrase-stdin", { type: "boolean", default: false, describe: "Read passphrase from stdin" })
  .option("passphrase-env", { type: "string", describe: "Read passphrase from env var (name)" })
  .option("user-agent", { type: "string", describe: "User-Agent string for Wikimedia APIs" })
  .option("api-url", { type: "string", default: DEFAULT_API_URL, describe: "Wikidata REST API base URL" })
  .option("action-url", { type: "string", default: DEFAULT_ACTION_URL, describe: "Wikidata Action API URL" })
  .option("sparql-url", { type: "string", default: DEFAULT_SPARQL_URL, describe: "Wikidata SPARQL endpoint URL" })
  .option("timeout", { type: "number", default: 15000 })
  .option("retries", { type: "number", default: 2 })
  .option("retry-backoff", { type: "number", default: 400 })
  .check((args) => {
    const globals = args as unknown as CliGlobals;
    assertNumber("timeout", globals.timeout, { min: 1, max: MAX_TIMER_MS, integer: true });
    assertNumber("retries", globals.retries, { min: 0, integer: true });
    assertNumber("retry-backoff", globals.retryBackoff, { min: 0, max: MAX_TIMER_MS, integer: true });
    assertHttpUrl("api-url", globals.apiUrl);
    assertHttpUrl("action-url", globals.actionUrl);
    assertHttpUrl("sparql-url", globals.sparqlUrl);
    return true;
  })
  .command(
    "help [command]",
    "Show help",
    (y: Argv) =>
      y
        .strict(false)
        .positional("command", {
          type: "string",
          describe: "Command to show help for (use <cmd> --help for details)"
        }),
    (args: Arguments) => {
      const globals = args as unknown as CliGlobals & { command?: string; _: unknown[] };
      const extraPieces = (Array.isArray(globals._) ? globals._.slice(1) : [])
        .map((value) => String(value).trim())
        .filter((value) => value.length > 0);
      const pieces = [
        ...(globals.command ? [globals.command.trim()] : []),
        ...extraPieces
      ].filter((value) => value.length > 0);
      if (pieces.length > 0) {
        setImmediate(() => {
          cli.parse([...pieces, "--help"]);
        });
        return;
      }
      cli.showHelp();
    }
  )
  .command(
    "config <command>",
    "Manage CLI configuration",
    (y: Argv) =>
      y
        .command(
          "get <key>",
          "Get a config value",
          (yy: Argv) => yy.positional("key", { type: "string" }),
          (args: Arguments) => {
            const globals = args as unknown as CliGlobals & { key: string };
            const entry = resolveConfigKey(globals.key);
            const config = loadConfigSafe();
            const rawValue = config[entry.field];
            const value = typeof rawValue === "undefined" ? null : rawValue;
            const mode = resolveOutput(globals).mode;
            if (mode === "json") {
              const status = value === null ? "warn" : "success";
              const summary =
                value === null
                  ? `Config ${globals.key} not set`
                  : `Config ${globals.key} retrieved`;
              outputResult(globals, "wiki.config.get.v1", summary, { key: globals.key, value }, status);
              return;
            }
            const outputValue = value === null ? "" : String(value);
            writeOutputOrThrow(`${outputValue}\n`, globals.output);
          }
        )
        .command(
          "set <key> <value>",
          "Set a config value (use \"none\" to unset)",
          (yy: Argv) =>
            yy
              .positional("key", { type: "string" })
              .positional("value", { type: "string" }),
          (args: Arguments) => {
            const globals = args as unknown as CliGlobals & { key: string; value: string };
            const entry = resolveConfigKey(globals.key);
            const parsedValue = parseConfigValue(entry, globals.value);
            if (typeof parsedValue === "number") {
              if (entry.field === "timeout") {
                assertNumber("timeout", parsedValue, { min: 1, max: MAX_TIMER_MS, integer: true });
              } else if (entry.field === "retries") {
                assertNumber("retries", parsedValue, { min: 0, integer: true });
              } else if (entry.field === "retryBackoff") {
                assertNumber("retry-backoff", parsedValue, { min: 0, max: MAX_TIMER_MS, integer: true });
              }
            } else if (typeof parsedValue === "string") {
              if (entry.field === "apiUrl") {
                assertHttpUrl("api-url", parsedValue);
              } else if (entry.field === "actionUrl") {
                assertHttpUrl("action-url", parsedValue);
              } else if (entry.field === "sparqlUrl") {
                assertHttpUrl("sparql-url", parsedValue);
              }
            }
            const config = loadConfigSafe();
            if (typeof parsedValue === "undefined") {
              delete config[entry.field];
            } else {
              config[entry.field] = parsedValue as never;
            }
            runIoOrThrow(() => saveConfig(config), "save config");
            const summary =
              typeof parsedValue === "undefined"
                ? `Config ${globals.key} removed`
                : `Config ${globals.key} updated`;
            outputResult(globals, "wiki.config.set.v1", summary, {
              key: globals.key,
              value: typeof parsedValue === "undefined" ? null : parsedValue
            });
          }
        )
        .command(
          "path",
          "Show config file path",
          () => {},
          (args: Arguments) => {
            const globals = args as unknown as CliGlobals;
            const pathValue = getConfigPath();
            const mode = resolveOutput(globals).mode;
            if (mode === "json") {
              outputResult(globals, "wiki.config.path.v1", "Config path", { path: pathValue });
              return;
            }
            writeOutputOrThrow(`${pathValue}\n`, globals.output);
          }
        )
        .demandCommand(1),
    () => {}
  )
  .command(
    "auth <command>",
    "Manage local auth tokens",
    (y: Argv) =>
      y
        .command(
          "login",
          "Store an OAuth token in encrypted config",
          (yy: Argv) =>
            yy
              .option("token-file", { type: "string", describe: "Read token from file" })
              .option("token-stdin", { type: "boolean", default: false, describe: "Read token from stdin" })
              .option("token-env", { type: "string", describe: "Read token from env var (name)" }),
          async (args: Arguments) => {
            const globals = args as unknown as CliGlobals & {
              tokenFile?: string;
              tokenStdin?: boolean;
              tokenEnv?: string;
            };
            const token = await resolveTokenInput(
              globals.tokenFile,
              Boolean(globals.tokenStdin),
              globals.tokenEnv,
              globals.nonInteractive
            );
            const passphrase = await resolvePassphrase({
              nonInteractive: globals.nonInteractive,
              confirm: true,
              ...(typeof globals.passphraseFile !== "undefined" ? { passphraseFile: globals.passphraseFile } : {}),
              ...(globals.passphraseStdin ? { passphraseStdin: globals.passphraseStdin } : {}),
              ...(typeof globals.passphraseEnv !== "undefined" ? { passphraseEnv: globals.passphraseEnv } : {})
            });
            const encrypted = encryptToken(token, passphrase);
            runIoOrThrow(() => saveCredentials(encrypted), "save credentials");
            const summary = "Token stored in encrypted config.";
            if (resolveOutput(globals).mode === "json") {
              outputResult(globals, "wiki.auth.login.v1", "Token stored in encrypted config", {
                stored: true
              });
            } else {
              writeOutputOrThrow(`${summary}\n`, globals.output);
            }
          }
        )
        .command(
          "status",
          "Check whether an encrypted token exists",
          () => {},
          (args: Arguments) => {
            const globals = args as unknown as CliGlobals;
            const state = loadCredentialsState();
            const credentials = state.credentials;
            if (resolveOutput(globals).mode === "json") {
              const status = !state.readable ? "error" : credentials ? "success" : "warn";
              const summary = !state.readable
                ? "Stored credentials are unreadable"
                : credentials
                  ? "Encrypted token present"
                  : "No token stored";
              outputResult(
                globals,
                "wiki.auth.status.v1",
                summary,
                { authenticated: Boolean(credentials), credentialsReadable: state.readable },
                status
              );
            } else {
              const message = !state.readable
                ? "Stored credentials are unreadable."
                : credentials
                  ? "Encrypted token present."
                  : "No token stored.";
              writeOutputOrThrow(`${message}\n`, globals.output);
            }
          }
        )
        .command(
          "logout",
          "Remove stored token",
          () => {},
          (args: Arguments) => {
            const globals = args as unknown as CliGlobals;
            runIoOrThrow(() => removeCredentials(), "remove credentials");
            if (resolveOutput(globals).mode === "json") {
              outputResult(globals, "wiki.auth.logout.v1", "Token removed", { removed: true });
            } else {
              writeOutputOrThrow("Token removed.\n", globals.output);
            }
          }
        )
        .demandCommand(1),
    () => {}
  )
  .command(
    "entity <command>",
    "Read Wikidata entities",
    (y: Argv) =>
      y
        .command(
          "get <id>",
          "Fetch an entity by id (Q/P/L)",
          () => {},
          async (args: Arguments) => {
            const globals = args as unknown as CliGlobals & { id: string };
            const id = assertEntityId(globals.id);
            const preview = Boolean(globals.printRequest);
            if (!preview) {
              requireNetwork(globals);
            }
            const logger = createLogger(resolveLogLevel(globals));
            const ua = resolveUserAgent(globals, !preview);
            const auth = await resolveAuthHeader(globals, preview ? "preview" : "request");
            if (preview) {
              const url = apiPathUrl(globals.apiUrl, entityPath(id));
              const previewData: RequestPreview = {
                method: "GET",
                url,
                headers: redactHeaders({ ...getHeaders(ua), ...auth })
              };
              outputRequestPreview(globals, `Preview ${id} request`, previewData);
              return;
            }
            const data = await getEntity(
              globals.apiUrl,
              id,
              { ...getHeaders(ua), ...auth },
              logger,
              globals
            );
            outputResult(globals, "wiki.entity.get.v1", `Fetched ${id}`, data);
          }
        )
        .command(
          "statements <id>",
          "Fetch entity statements",
          () => {},
          async (args: Arguments) => {
            const globals = args as unknown as CliGlobals & { id: string };
            const id = assertEntityId(globals.id);
            const preview = Boolean(globals.printRequest);
            if (!preview) {
              requireNetwork(globals);
            }
            const logger = createLogger(resolveLogLevel(globals));
            const ua = resolveUserAgent(globals, !preview);
            const auth = await resolveAuthHeader(globals, preview ? "preview" : "request");
            if (preview) {
              const url = apiPathUrl(globals.apiUrl, `${entityPath(id)}/statements`);
              const previewData: RequestPreview = {
                method: "GET",
                url,
                headers: redactHeaders({ ...getHeaders(ua), ...auth })
              };
              outputRequestPreview(globals, `Preview ${id} statements request`, previewData);
              return;
            }
            const data = await getStatements(
              globals.apiUrl,
              id,
              { ...getHeaders(ua), ...auth },
              logger,
              globals
            );
            outputResult(globals, "wiki.entity.statements.v1", `Fetched ${id} statements`, data);
          }
        )
        .demandCommand(1),
    () => {}
  )
  .command(
    "sparql [mode]",
    "Run a SPARQL query",
    (y: Argv) =>
      y
        .positional("mode", { choices: ["run", "query"] as const, default: "query" })
        .option("query", { type: "string", describe: "SPARQL query string" })
        .option("file", { type: "string", describe: "SPARQL query file" })
        .option("format", { choices: ["json", "csv", "tsv"] as const, default: "json" }),
    async (args: Arguments) => {
      const globals = args as unknown as CliGlobals & {
        mode?: "run" | "query";
        query?: string;
        file?: string;
        format: "json" | "csv" | "tsv";
      };
      const preview = Boolean(globals.printRequest);
      if (!preview) {
        requireNetwork(globals);
      }
      const logger = createLogger(resolveLogLevel(globals));
      const ua = resolveUserAgent(globals, !preview);
      const auth = await resolveAuthHeader(globals, preview ? "preview" : "request");
      const queryInput: { query?: string; file?: string } = {};
      if (globals.query !== undefined) queryInput.query = globals.query;
      if (globals.file !== undefined) queryInput.file = globals.file;
      const query = await resolveQueryInput(queryInput, globals.nonInteractive);
      if (preview) {
        const previewData: RequestPreview = {
          method: "POST",
          url: globals.sparqlUrl,
          headers: redactHeaders({
            ...getHeaders(ua),
            ...auth,
            "content-type": "application/sparql-query",
            accept:
              globals.format === "json"
                ? "application/sparql-results+json"
                : globals.format === "csv"
                  ? "text/csv"
                  : "text/tab-separated-values"
          }),
          body: query
        };
        outputRequestPreview(globals, "Preview SPARQL request", previewData);
        return;
      }
      const data = await sparqlQuery(
        globals.sparqlUrl,
        query,
        globals.format,
        { ...getHeaders(ua), ...auth },
        logger,
        globals
      );
      outputResult(globals, "wiki.sparql.query.v1", "SPARQL query executed", data);
    }
  )
  .command(
    "action search",
    "Search entities via Action API",
    (y: Argv) =>
      y
        .option("query", { type: "string", demandOption: true })
        .option("language", { type: "string", default: "en" })
        .option("limit", { type: "number", default: 5 })
        .check((args: Arguments) => {
          const globals = args as unknown as { query: string; language: string; limit: number };
          if (typeof globals.query !== "string" || globals.query.trim().length === 0) {
            throw new CliError("query must be a non-empty string.", 2, "E_USAGE");
          }
          if (typeof globals.language !== "string" || globals.language.trim().length === 0) {
            throw new CliError("language must be a non-empty string.", 2, "E_USAGE");
          }
          assertNumber("limit", globals.limit, { min: 1, integer: true });
          return true;
        }),
    async (args: Arguments) => {
      const globals = args as unknown as CliGlobals & { query: string; language: string; limit: number };
      const query = globals.query.trim();
      const language = globals.language.trim();
      const preview = Boolean(globals.printRequest);
      if (!preview) {
        requireNetwork(globals);
      }
      const logger = createLogger(resolveLogLevel(globals));
      const ua = resolveUserAgent(globals, !preview);
      const auth = await resolveAuthHeader(globals, preview ? "preview" : "request");
      if (preview) {
        const url = new URL(globals.actionUrl);
        url.searchParams.set("action", "wbsearchentities");
        url.searchParams.set("search", query);
        url.searchParams.set("language", language);
        url.searchParams.set("limit", String(globals.limit));
        url.searchParams.set("format", "json");
        const previewData: RequestPreview = {
          method: "GET",
          url: url.toString(),
          headers: redactHeaders({ ...getHeaders(ua), ...auth })
        };
        outputRequestPreview(globals, "Preview Action API search", previewData);
        return;
      }
      const data = await actionSearch(
        globals.actionUrl,
        query,
        language,
        globals.limit,
        { ...getHeaders(ua), ...auth },
        logger,
        globals
      );
      outputResult(globals, "wiki.action.search.v1", "Action search executed", data);
    }
  )
  .command(
    "raw request <method> <path>",
    "Make a raw REST API request",
    (y: Argv) => y.option("body-file", { type: "string" }),
    async (args: Arguments) => {
      const globals = args as unknown as CliGlobals & { method: string; path: string; bodyFile?: string };
      const method = assertHttpMethod(globals.method);
      const requestPath = assertApiRelativePath(globals.path);
      const preview = Boolean(globals.printRequest);
      if (!preview) {
        requireNetwork(globals);
      }
      const logger = createLogger(resolveLogLevel(globals));
      const ua = resolveUserAgent(globals, !preview);
      const auth = await resolveAuthHeader(globals, preview ? "preview" : "request");
      let body: string | undefined;
      if (typeof globals.bodyFile !== "undefined") {
        if (globals.bodyFile.trim().length === 0) {
          throw new CliError("--body-file requires a non-empty file path.", 2, "E_USAGE");
        }
        body = readFileOrThrow(globals.bodyFile, "body");
      }
      if (preview) {
        const url = apiPathUrl(globals.apiUrl, requestPath);
        const headers = {
          ...getHeaders(ua),
          ...auth,
          ...(body !== undefined ? { "content-type": "application/json" } : {})
        };
        const previewData: RequestPreview = {
          method,
          url,
          headers: redactHeaders(headers),
          ...(body !== undefined ? { body } : {})
        };
        outputRequestPreview(globals, "Preview raw request", previewData);
        return;
      }
      const data = await rawRequest(
        globals.apiUrl,
        method,
        requestPath,
        { ...getHeaders(ua), ...auth },
        body,
        logger,
        globals
      );
      outputResult(globals, "wiki.raw.request.v1", "Raw request executed", data);
    }
  )
  .command(
    "doctor",
    "Check configuration",
    () => {},
    (args: Arguments) => {
      const globals = args as unknown as CliGlobals;
      const ua = resolveUserAgent(globals, false);
      const state = loadCredentialsState();
      const hasToken = Boolean(state.credentials);
      const data = {
        userAgentConfigured: Boolean(ua),
        encryptedTokenPresent: hasToken,
        credentialsReadable: state.readable,
        configPath: getConfigPath(),
        apiUrl: globals.apiUrl,
        actionUrl: globals.actionUrl,
        sparqlUrl: globals.sparqlUrl
      };
      const status: "success" | "warn" | "error" = !state.readable
        ? "error"
        : data.userAgentConfigured && data.encryptedTokenPresent
          ? "success"
          : "warn";
      const summary =
        status === "error"
          ? "Configuration issues detected"
          : status === "warn"
            ? "Configuration incomplete"
            : "Configuration check";
      if (resolveOutput(globals).mode === "json") {
        outputResult(globals, "wiki.doctor.v1", summary, data, status);
      } else {
        writeOutputOrThrow(
          [
            `User-Agent configured: ${data.userAgentConfigured ? "yes" : "no"}`,
            `Encrypted token present: ${data.encryptedTokenPresent ? "yes" : "no"}`,
            `Credentials readable: ${data.credentialsReadable ? "yes" : "no"}`,
            `Config path: ${data.configPath}`,
            `API URL: ${data.apiUrl}`,
            `Action URL: ${data.actionUrl}`,
            `SPARQL URL: ${data.sparqlUrl}`
          ].join("\n") + "\n",
          globals.output
        );
      }
    }
  )
  .completion("completion", "Generate shell completion script")
  .strict()
  .recommendCommands()
  .demandCommand(1)
  .exitProcess(false)
  .fail((msg, err, y) => {
    const message = err?.message ?? msg ?? "Unexpected error";
    const isUsageError =
      !err || (err as { name?: string }).name === "YError" || (err instanceof CliError && err.exitCode === 2);
    const code = err instanceof CliError ? err.code : isUsageError ? "E_USAGE" : "E_INTERNAL";
    const exitCode = err instanceof CliError ? err.exitCode : isUsageError ? 2 : 1;
    const { mode, output, requestId, agent } = resolveErrorContext();

    if (mode === "json") {
      const payload = envelope("wiki.error.v1", message, "error", null, [{ message, code }], requestId);
      try {
        writeOutput(`${JSON.stringify(payload)}\n`, output);
      } catch (_outputError) {
        process.stdout.write(`${JSON.stringify(payload)}\n`);
      }
      process.exit(exitCode);
    }

    if (agent) {
      // Agent mode: detailed error help with examples
      const help = getErrorHelp(code, message);
      process.stderr.write(`${formatAgentError(help, true)}\n`);
      process.exit(exitCode);
    }

    if (message) process.stderr.write(`${message}\n`);
    if (isUsageError) {
      (y as Argv).showHelp();
    }
    process.exit(exitCode);
  })
  .help()
  .version();

void (async () => {
  try {
    await cli.parseAsync();
  } catch (error) {
    emitUnhandledCliError(error);
  }
})();
