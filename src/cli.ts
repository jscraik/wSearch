#!/usr/bin/env node
import yargs from "yargs";
import type { Argv, Arguments } from "yargs";
import { hideBin } from "yargs/helpers";
import { createLogger, envelope, formatPlain, resolveOutputMode, writeOutput } from "./output.js";
import { CliGlobals } from "./types.js";
import { actionSearch, entityPath, getEntity, getStatements, rawRequest, sparqlQuery } from "./wikidata.js";
import { readFile, readStdin, promptHidden, promptText } from "./io.js";
import { decryptToken, encryptToken } from "./crypto.js";
import { getConfigPath, loadConfig, removeCredentials, saveConfig, saveCredentials, loadCredentials } from "./config.js";

const DEFAULT_API_URL = "https://www.wikidata.org/w/rest.php/wikibase/v1";
const DEFAULT_ACTION_URL = "https://www.wikidata.org/w/api.php";
const DEFAULT_SPARQL_URL = "https://query.wikidata.org/sparql";

class CliError extends Error {
  exitCode: number;
  code: string;

  constructor(message: string, exitCode = 1, code = "E_INTERNAL") {
    super(message);
    this.exitCode = exitCode;
    this.code = code;
  }
}

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
    throw new CliError("Failed to read config file. Fix or delete it and retry.", 1, "E_INTERNAL");
  }
}

function loadConfigDefaults(): Partial<CliGlobals> {
  const config = loadConfigSafe();
  const defaults: Partial<CliGlobals> = {};
  if (config.userAgent) defaults.userAgent = config.userAgent;
  if (config.apiUrl) defaults.apiUrl = config.apiUrl;
  if (config.actionUrl) defaults.actionUrl = config.actionUrl;
  if (config.sparqlUrl) defaults.sparqlUrl = config.sparqlUrl;
  if (typeof config.timeout !== "undefined") {
    if (typeof config.timeout !== "number" || Number.isNaN(config.timeout)) {
      throw new CliError("Config timeout must be a valid number.", 2, "E_VALIDATION");
    }
    defaults.timeout = config.timeout;
  }
  if (typeof config.retries !== "undefined") {
    if (typeof config.retries !== "number" || Number.isNaN(config.retries)) {
      throw new CliError("Config retries must be a valid number.", 2, "E_VALIDATION");
    }
    defaults.retries = config.retries;
  }
  if (typeof config.retryBackoff !== "undefined") {
    if (typeof config.retryBackoff !== "number" || Number.isNaN(config.retryBackoff)) {
      throw new CliError("Config retry-backoff must be a valid number.", 2, "E_VALIDATION");
    }
    defaults.retryBackoff = config.retryBackoff;
  }
  return defaults;
}

function loadEnvOverrides(): Partial<CliGlobals> {
  const overrides: Partial<CliGlobals> = {};
  const env = process.env;
  if (env.WIKI_USER_AGENT) overrides.userAgent = env.WIKI_USER_AGENT;
  if (env.WIKI_API_URL) overrides.apiUrl = env.WIKI_API_URL;
  if (env.WIKI_ACTION_URL) overrides.actionUrl = env.WIKI_ACTION_URL;
  if (env.WIKI_SPARQL_URL) overrides.sparqlUrl = env.WIKI_SPARQL_URL;
  if (env.WIKI_TIMEOUT) {
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
  if (env.WIKI_RETRIES) {
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
  if (env.WIKI_RETRY_BACKOFF) {
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

function parseRequestIdFromArgv(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg === "--request-id") {
      return argv[i + 1];
    }
    if (arg.startsWith("--request-id=")) {
      const value = arg.split("=", 2)[1];
      if (value) return value;
    }
  }
  return undefined;
}

function resolveErrorContext(): { mode: "plain" | "json"; output?: string; requestId?: string } {
  const fallback = parseOutputArgsFromArgv(hideBin(process.argv));
  const requestId = lastKnownArgs.requestId ?? parseRequestIdFromArgv(hideBin(process.argv));
  const json = Boolean(lastKnownArgs.json ?? fallback.json);
  const output = lastKnownArgs.output ?? fallback.output;
  const context: { mode: "plain" | "json"; output?: string; requestId?: string } = json
    ? { mode: "json" }
    : { mode: "plain" };
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
  options: { min?: number; integer?: boolean }
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
}

async function resolveAuthHeader(args: CliGlobals, mode: "preview" | "request"): Promise<HeadersInit> {
  if (!args.auth) return {};
  const stored = loadCredentials();
  if (!stored) {
    throw new CliError("No stored token found. Run `wiki auth login` first.", 3, "E_AUTH");
  }
  if (mode === "preview") {
    return { authorization: "Bearer <redacted>" };
  }
  const passphrase = await resolvePassphrase({
    nonInteractive: args.nonInteractive,
    confirm: false,
    ...(args.passphraseFile ? { passphraseFile: args.passphraseFile } : {}),
    ...(args.passphraseStdin ? { passphraseStdin: args.passphraseStdin } : {}),
    ...(args.passphraseEnv ? { passphraseEnv: args.passphraseEnv } : {})
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
    writeOutput(`${JSON.stringify(payload)}\n`, args.output);
  } else {
    writeOutput(formatPlain(data), args.output);
  }
}

async function resolveQueryInput({ query, file }: { query?: string; file?: string }, nonInteractive: boolean) {
  if (query) return query;
  if (file) return readFile(file);
  if (!process.stdin.isTTY) return readStdin();
  if (nonInteractive) throw new Error("Query input required. Provide --query, --file, or stdin.");
  return promptText("SPARQL query: ");
}

async function resolveTokenInput(
  tokenFile: string | undefined,
  tokenStdin: boolean,
  tokenEnv: string | undefined,
  nonInteractive: boolean
): Promise<string> {
  if (tokenFile) return readFile(tokenFile).trim();
  if (tokenStdin) return (await readStdin()).trim();
  const envName = tokenEnv ?? "WIKI_TOKEN";
  const envToken = process.env[envName];
  if (envToken && envToken.trim().length > 0) return envToken.trim();
  if (process.stdin.isTTY) {
    if (nonInteractive) {
      throw new Error(
        "Token input required. Provide --token-file, --token-stdin, or --token-env (or set WIKI_TOKEN)."
      );
    }
    return promptHidden("Paste OAuth token: ");
  }
  throw new Error(
    "Token input required. Provide --token-file, --token-stdin, or --token-env (or set WIKI_TOKEN)."
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
  if (options.passphraseFile) {
    const passphrase = readFile(options.passphraseFile).trim();
    validatePassphrase(passphrase);
    return passphrase;
  }
  if (options.passphraseStdin) {
    const passphrase = (await readStdin()).trim();
    validatePassphrase(passphrase);
    return passphrase;
  }
  const envName = options.passphraseEnv ?? "WIKI_PASSPHRASE";
  const envValue = process.env[envName];
  if (envValue && envValue.trim().length > 0) {
    const passphrase = envValue.trim();
    validatePassphrase(passphrase);
    return passphrase;
  }
  if (!process.stdin.isTTY) {
    throw new Error(
      "Passphrase input required. Provide --passphrase-file, --passphrase-stdin, or --passphrase-env (or set WIKI_PASSPHRASE)."
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
      throw new Error("Passphrases do not match.");
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
      const value = argv[i + 1];
      if (value) {
        result.output = value;
      }
      i += 1;
    } else if (arg.startsWith("--output=")) {
      const value = arg.split("=", 2)[1];
      if (value) {
        result.output = value;
      }
    }
  }
  return result;
}

cli
  .scriptName("wiki")
  .usage("wiki [global flags] <subcommand> [args]")
  .example("wiki --network --user-agent \"MyApp/1.0 (https://example.org/contact)\" entity get Q42", "")
  .example("wiki --network sparql query --file ./query.rq --format json", "")
  .example("wiki --network action search --query \"New York\" --language en --limit 5", "")
  .example("wiki auth login --token-stdin < token.txt", "")
  .config(mergedDefaults)
  .middleware((args: Arguments) => {
    lastKnownArgs = args as unknown as CliGlobals;
    if (configLoadError) {
      throw configLoadError;
    }
    if (envLoadError) {
      throw envLoadError;
    }
    if (args.help) return;
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
.option("non-interactive", { type: "boolean", default: false, describe: "Disable prompts (non-interactive mode)" })
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
    assertNumber("timeout", globals.timeout, { min: 1 });
    assertNumber("retries", globals.retries, { min: 0, integer: true });
    assertNumber("retry-backoff", globals.retryBackoff, { min: 0, integer: true });
    return true;
  })
  .command(
    "help [command]",
    "Show help",
    (y: Argv) =>
      y.positional("command", {
        type: "string",
        describe: "Command to show help for (use <cmd> --help for details)"
      }),
    (args: Arguments) => {
      const globals = args as unknown as CliGlobals & { command?: string };
      if (globals.command) {
        const pieces = globals.command.split(/\s+/).filter(Boolean);
        cli.parse([...pieces, "--help"], (err: Error | null, _argv: unknown, output: string | undefined) => {
          if (output) process.stdout.write(output);
          if (err) process.stderr.write(`${err.message}\n`);
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
            writeOutput(`${outputValue}\n`, globals.output);
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
                assertNumber("timeout", parsedValue, { min: 1, integer: true });
              } else if (entry.field === "retries") {
                assertNumber("retries", parsedValue, { min: 0, integer: true });
              } else if (entry.field === "retryBackoff") {
                assertNumber("retry-backoff", parsedValue, { min: 0, integer: true });
              }
            }
            const config = loadConfigSafe();
            if (typeof parsedValue === "undefined") {
              delete config[entry.field];
            } else {
              config[entry.field] = parsedValue as never;
            }
            saveConfig(config);
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
            writeOutput(`${pathValue}\n`, globals.output);
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
            const logger = createLogger(resolveLogLevel(globals));
            const token = await resolveTokenInput(
              globals.tokenFile,
              Boolean(globals.tokenStdin),
              globals.tokenEnv,
              globals.nonInteractive
            );
            const passphrase = await resolvePassphrase({
              nonInteractive: globals.nonInteractive,
              confirm: true,
              ...(globals.passphraseFile ? { passphraseFile: globals.passphraseFile } : {}),
              ...(globals.passphraseStdin ? { passphraseStdin: globals.passphraseStdin } : {}),
              ...(globals.passphraseEnv ? { passphraseEnv: globals.passphraseEnv } : {})
            });
            const encrypted = encryptToken(token, passphrase);
            saveCredentials(encrypted);
            logger.info("Token stored in encrypted config.");
          }
        )
        .command(
          "status",
          "Check whether an encrypted token exists",
          () => {},
          (args: Arguments) => {
            const globals = args as unknown as CliGlobals;
            const logger = createLogger(resolveLogLevel(globals));
            const credentials = loadCredentials();
            if (credentials) {
              logger.info("Encrypted token present.");
            } else {
              logger.info("No token stored.");
            }
          }
        )
        .command(
          "logout",
          "Remove stored token",
          () => {},
          (args: Arguments) => {
            const globals = args as unknown as CliGlobals;
            const logger = createLogger(resolveLogLevel(globals));
            removeCredentials();
            logger.info("Token removed.");
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
            const preview = Boolean(globals.printRequest);
            if (!preview) {
              requireNetwork(globals);
            }
            const logger = createLogger(resolveLogLevel(globals));
            const ua = resolveUserAgent(globals, !preview);
            const auth = await resolveAuthHeader(globals, preview ? "preview" : "request");
            if (preview) {
              const url = new URL(entityPath(globals.id), globals.apiUrl).toString();
              const previewData: RequestPreview = {
                method: "GET",
                url,
                headers: redactHeaders({ ...getHeaders(ua), ...auth })
              };
              outputRequestPreview(globals, `Preview ${globals.id} request`, previewData);
              return;
            }
            const data = await getEntity(
              globals.apiUrl,
              globals.id,
              { ...getHeaders(ua), ...auth },
              logger,
              globals
            );
            outputResult(globals, "wiki.entity.get.v1", `Fetched ${globals.id}`, data);
          }
        )
        .command(
          "statements <id>",
          "Fetch entity statements",
          () => {},
          async (args: Arguments) => {
            const globals = args as unknown as CliGlobals & { id: string };
            const preview = Boolean(globals.printRequest);
            if (!preview) {
              requireNetwork(globals);
            }
            const logger = createLogger(resolveLogLevel(globals));
            const ua = resolveUserAgent(globals, !preview);
            const auth = await resolveAuthHeader(globals, preview ? "preview" : "request");
            if (preview) {
              const url = new URL(`${entityPath(globals.id)}/statements`, globals.apiUrl).toString();
              const previewData: RequestPreview = {
                method: "GET",
                url,
                headers: redactHeaders({ ...getHeaders(ua), ...auth })
              };
              outputRequestPreview(globals, `Preview ${globals.id} statements request`, previewData);
              return;
            }
            const data = await getStatements(
              globals.apiUrl,
              globals.id,
              { ...getHeaders(ua), ...auth },
              logger,
              globals
            );
            outputResult(globals, "wiki.entity.statements.v1", `Fetched ${globals.id} statements`, data);
          }
        )
        .demandCommand(1),
    () => {}
  )
  .command(
    "sparql query",
    "Run a SPARQL query",
    (y: Argv) =>
      y
        .option("query", { type: "string", describe: "SPARQL query string" })
        .option("file", { type: "string", describe: "SPARQL query file" })
        .option("format", { choices: ["json", "csv", "tsv"] as const, default: "json" }),
    async (args: Arguments) => {
      const globals = args as unknown as CliGlobals & { query?: string; file?: string; format: "json" | "csv" | "tsv" };
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
          const globals = args as unknown as { limit: number };
          assertNumber("limit", globals.limit, { min: 1, integer: true });
          return true;
        }),
    async (args: Arguments) => {
      const globals = args as unknown as CliGlobals & { query: string; language: string; limit: number };
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
        url.searchParams.set("search", globals.query);
        url.searchParams.set("language", globals.language);
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
        globals.query,
        globals.language,
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
      const preview = Boolean(globals.printRequest);
      if (!preview) {
        requireNetwork(globals);
      }
      const logger = createLogger(resolveLogLevel(globals));
      const ua = resolveUserAgent(globals, !preview);
      const auth = await resolveAuthHeader(globals, preview ? "preview" : "request");
      const body = globals.bodyFile ? readFile(globals.bodyFile) : undefined;
      if (preview) {
        if (!globals.path.startsWith("/")) {
          throw new CliError("Path must start with '/'.", 2, "E_USAGE");
        }
        const url = new URL(globals.path, globals.apiUrl).toString();
        const headers = {
          ...getHeaders(ua),
          ...auth,
          ...(body !== undefined ? { "content-type": "application/json" } : {})
        };
        const previewData: RequestPreview = {
          method: globals.method.toUpperCase(),
          url,
          headers: redactHeaders(headers),
          ...(body !== undefined ? { body } : {})
        };
        outputRequestPreview(globals, "Preview raw request", previewData);
        return;
      }
      const data = await rawRequest(
        globals.apiUrl,
        globals.method,
        globals.path,
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
      const logger = createLogger(resolveLogLevel(globals));
      const ua = globals.userAgent ?? process.env.WIKI_USER_AGENT;
      const hasToken = Boolean(loadCredentials());
      logger.info(`User-Agent configured: ${ua ? "yes" : "no"}`);
      logger.info(`Encrypted token present: ${hasToken ? "yes" : "no"}`);
      logger.info(`API URL: ${globals.apiUrl}`);
      logger.info(`Action URL: ${globals.actionUrl}`);
      logger.info(`SPARQL URL: ${globals.sparqlUrl}`);
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
    const { mode, output, requestId } = resolveErrorContext();

    if (mode === "json") {
      const payload = envelope("wiki.error.v1", message, "error", null, [{ message, code }], requestId);
      writeOutput(`${JSON.stringify(payload)}\n`, output);
      process.exit(exitCode);
    }

    if (message) process.stderr.write(`${message}\n`);
    if (isUsageError) {
      (y as Argv).showHelp();
    }
    process.exit(exitCode);
  })
  .help()
  .version()
  .parse();
