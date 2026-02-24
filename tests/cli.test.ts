import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

function runCli(args: string[], options?: { env?: NodeJS.ProcessEnv; input?: string }) {
  const tsxPath = path.join(
    process.cwd(),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "tsx.cmd" : "tsx",
  );
  const cliPath = path.join(process.cwd(), "src", "cli.ts");

  if (!fs.existsSync(tsxPath)) {
    throw new Error(`tsx binary not found at ${tsxPath}`);
  }

  const isolatedConfigHome =
    options?.env?.XDG_CONFIG_HOME ?? fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-test-"));
  const result = spawnSync(tsxPath, [cliPath, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_NO_WARNINGS: "1",
      XDG_CONFIG_HOME: isolatedConfigHome,
      ...options?.env,
    },
    ...(options?.input !== undefined ? { input: options.input } : {}),
  });

  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
  };
}

describe("cli error handling", () => {
  it("returns JSON error envelope with E_POLICY when network is disabled", () => {
    const result = runCli(["--json", "entity", "get", "Q42"]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(3);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.status).toBe("error");
    expect(payload.errors?.[0]?.code).toBe("E_POLICY");
  });

  it("returns JSON error envelope with E_USAGE for conflicting output flags", () => {
    const result = runCli(["--json", "--plain"]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.status).toBe("error");
    expect(payload.errors?.[0]?.code).toBe("E_USAGE");
  });

  it("renders help command cleanly even when --json and --plain are both provided", () => {
    const result = runCli(["--json", "--plain", "help"]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("wsearch [global flags]");
    expect(result.stdout).not.toContain("\"wiki.error.v1\"");
    expect(result.stderr.trim()).toBe("");
  });

  it("writes startup JSON errors to -o output file", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const outputPath = path.join(tmpDir, "error.json");
    const result = runCli(["--json", "-o", outputPath, "--plain"]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    expect(result.stdout.trim()).toBe("");
    const payload = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.status).toBe("error");
  });

  it("ignores --output when its value is missing in startup error mode", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const configDir = path.join(tmpDir, "wsearch-cli");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "config.json"), "{", "utf8");
    const result = runCli(
      ["--json", "--output", "--plain", "config", "path"],
      { env: { XDG_CONFIG_HOME: tmpDir } },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr.trim()).toBe("");
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_INTERNAL");
  });

  it("ignores --request-id when its value is missing in startup error mode", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const configDir = path.join(tmpDir, "wsearch-cli");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "config.json"), "{", "utf8");
    const result = runCli(
      ["--json", "--request-id", "--plain", "config", "path"],
      { env: { XDG_CONFIG_HOME: tmpDir } },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr.trim()).toBe("");
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.meta?.request_id).toBeUndefined();
    expect(payload.errors?.[0]?.code).toBe("E_INTERNAL");
  });

  it("creates parent directories for -o output files", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const outputPath = path.join(tmpDir, "nested", "errors", "error.json");
    const result = runCli(["--json", "-o", outputPath, "entity", "get", "Q42"]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(3);
    expect(result.stdout.trim()).toBe("");
    const payload = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_POLICY");
  });

  it("falls back to stdout JSON when -o points to a directory", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const result = runCli(["--json", "-o", tmpDir, "entity", "get", "Q42"]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(3);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_POLICY");
  });

  it("returns E_IO when a successful command cannot write to -o path", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const result = runCli(["--json", "-o", tmpDir, "config", "path"]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_IO");
  });

  it("returns E_USAGE when --output is explicitly empty", () => {
    const result = runCli(["--json", "--output", "", "config", "path"]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_USAGE");
    expect(payload.summary).toContain("--output requires a non-empty file path.");
  });

  it("returns E_USAGE when --request-id is explicitly empty", () => {
    const result = runCli(["--json", "--request-id", "", "config", "path"]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_USAGE");
    expect(payload.summary).toContain("--request-id requires a non-empty value.");
  });

  it("returns E_IO when config cannot be persisted due to invalid config home path", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const fakeConfigHome = path.join(tmpDir, "not-a-dir");
    fs.writeFileSync(fakeConfigHome, "x", "utf8");
    const result = runCli(["--json", "config", "set", "user-agent", "Test/1.0"], {
      env: { XDG_CONFIG_HOME: fakeConfigHome },
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_IO");
    expect(payload.summary).toContain("Failed to save config");
  });

  it("returns E_IO when auth login cannot persist credentials", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const fakeConfigHome = path.join(tmpDir, "not-a-dir");
    fs.writeFileSync(fakeConfigHome, "x", "utf8");
    const result = runCli(
      [
        "--json",
        "--no-input",
        "auth",
        "login",
        "--token-env",
        "WIKI_TOKEN",
        "--passphrase-env",
        "WIKI_PASSPHRASE",
      ],
      {
        env: {
          XDG_CONFIG_HOME: fakeConfigHome,
          WIKI_TOKEN: "token",
          WIKI_PASSPHRASE: "passphrase",
        },
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_IO");
    expect(payload.summary).toContain("Failed to save credentials");
  });

  it("returns E_USAGE when sparql query input is missing in non-interactive mode", () => {
    const result = runCli(["--json", "--print-request", "sparql", "query"]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_USAGE");
  });

  it("returns E_USAGE when sparql query is explicitly empty", () => {
    const result = runCli(["--json", "--print-request", "sparql", "query", "--query", ""]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_USAGE");
    expect(payload.summary).toContain("Provided --query was empty");
  });

  it("returns E_USAGE when sparql file path is explicitly empty", () => {
    const result = runCli(["--json", "--print-request", "sparql", "query", "--file", ""]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_USAGE");
    expect(payload.summary).toContain("--file requires a non-empty file path.");
  });

  it("returns E_VALIDATION for fractional timeout values", () => {
    const result = runCli(["--json", "--timeout", "1.5", "config", "path"]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    expect(result.stderr.trim()).toBe("");
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_VALIDATION");
  });

  it("returns E_VALIDATION for timeout values above max timer range", () => {
    const result = runCli(["--json", "--timeout", "2147483648", "config", "path"]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    expect(result.stderr.trim()).toBe("");
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_VALIDATION");
  });

  it("returns E_VALIDATION for retry-backoff values above max timer range", () => {
    const result = runCli(["--json", "--retry-backoff", "2147483648", "config", "path"]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    expect(result.stderr.trim()).toBe("");
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_VALIDATION");
  });

  it("returns E_VALIDATION for invalid api-url flag values", () => {
    const result = runCli(["--json", "--api-url", "not-a-url", "--print-request", "entity", "get", "Q42"]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    expect(result.stderr.trim()).toBe("");
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_VALIDATION");
  });

  it("returns E_USAGE for unknown config keys without stack traces", () => {
    const result = runCli(["--json", "config", "get", "badkey"]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    expect(result.stderr.trim()).toBe("");
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_USAGE");
  });

  it("returns E_VALIDATION when config set timeout exceeds max timer range", () => {
    const result = runCli(["--json", "config", "set", "timeout", "2147483648"]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    expect(result.stderr.trim()).toBe("");
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_VALIDATION");
  });

  it("returns E_VALIDATION when config set api-url is invalid", () => {
    const result = runCli(["--json", "config", "set", "api-url", "not-a-url"]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    expect(result.stderr.trim()).toBe("");
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_VALIDATION");
  });

  it("returns E_IO when --file points to a missing sparql query file", () => {
    const result = runCli([
      "--json",
      "--print-request",
      "sparql",
      "query",
      "--file",
      "/no/such/query.rq",
    ]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr.trim()).toBe("");
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_IO");
  });

  it("returns E_USAGE when sparql receives both --query and --file", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const queryPath = path.join(tmpDir, "query.rq");
    fs.writeFileSync(queryPath, "SELECT * WHERE { ?s ?p ?o } LIMIT 1", "utf8");
    const result = runCli([
      "--json",
      "--print-request",
      "sparql",
      "--query",
      "SELECT * WHERE { ?s ?p ?o } LIMIT 1",
      "--file",
      queryPath,
    ]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_USAGE");
  });

  it("returns E_IO when raw request body file is missing", () => {
    const result = runCli([
      "--json",
      "--print-request",
      "raw",
      "request",
      "POST",
      "/entities/items/Q42",
      "--body-file",
      "/no/such/body.json",
    ]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr.trim()).toBe("");
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_IO");
  });

  it("returns E_USAGE when raw request body file path is explicitly empty", () => {
    const result = runCli([
      "--json",
      "--print-request",
      "raw",
      "request",
      "POST",
      "/entities/items/Q42",
      "--body-file",
      "",
    ]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    expect(result.stderr.trim()).toBe("");
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_USAGE");
    expect(payload.summary).toContain("--body-file requires a non-empty file path.");
  });

  it("returns E_USAGE when --token-stdin is empty", () => {
    const result = runCli(
      [
        "--json",
        "--no-input",
        "auth",
        "login",
        "--token-stdin",
        "--passphrase-env",
        "WIKI_PASSPHRASE",
      ],
      { env: { WIKI_PASSPHRASE: "test-passphrase" } },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_USAGE");
  });

  it("returns E_IO when --token-file path is missing", () => {
    const result = runCli(
      [
        "--json",
        "--no-input",
        "auth",
        "login",
        "--token-file",
        "/no/such/token.txt",
        "--passphrase-env",
        "WIKI_PASSPHRASE",
      ],
      { env: { WIKI_PASSPHRASE: "test-passphrase" } },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr.trim()).toBe("");
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_IO");
  });

  it("does not silently succeed when --token-stdin and --passphrase-stdin reuse exhausted stdin", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const result = runCli(
      [
        "--json",
        "--no-input",
        "auth",
        "login",
        "--token-stdin",
        "--passphrase-stdin",
      ],
      { env: { XDG_CONFIG_HOME: tmpDir }, input: "abc-token" },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_USAGE");
  });

  it("returns E_USAGE when auth login receives multiple token sources", () => {
    const result = runCli(
      [
        "--json",
        "--no-input",
        "auth",
        "login",
        "--token-stdin",
        "--token-env",
        "WIKI_TOKEN",
        "--passphrase-env",
        "WIKI_PASSPHRASE",
      ],
      { env: { WIKI_TOKEN: "token", WIKI_PASSPHRASE: "passphrase" }, input: "stdin-token" },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_USAGE");
  });

  it("returns E_USAGE when auth login receives multiple passphrase sources", () => {
    const result = runCli(
      [
        "--json",
        "--no-input",
        "auth",
        "login",
        "--token-env",
        "WIKI_TOKEN",
        "--passphrase-stdin",
        "--passphrase-env",
        "WIKI_PASSPHRASE",
      ],
      { env: { WIKI_TOKEN: "token", WIKI_PASSPHRASE: "passphrase" }, input: "stdin-passphrase" },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_USAGE");
  });

  it("returns structured startup error when config json is corrupted", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const configDir = path.join(tmpDir, "wsearch-cli");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "config.json"), "{", "utf8");
    const result = runCli(["--json", "config", "path"], { env: { XDG_CONFIG_HOME: tmpDir } });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_INTERNAL");
    expect(payload.summary).toContain(path.join(tmpDir, "wsearch-cli", "config.json"));
  });

  it("writes startup JSON errors to file for combined -o<path> form", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const configDir = path.join(tmpDir, "wsearch-cli");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "config.json"), "{", "utf8");
    const outputPath = path.join(tmpDir, "startup-error.json");
    const result = runCli(
      ["--json", `-o${outputPath}`, "config", "path"],
      { env: { XDG_CONFIG_HOME: tmpDir } },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout.trim()).toBe("");
    const payload = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_INTERNAL");
  });

  it("returns startup E_VALIDATION when WIKI_API_URL is invalid", () => {
    const result = runCli(["--json", "config", "path"], {
      env: { WIKI_API_URL: "not-a-url" },
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    expect(result.stderr.trim()).toBe("");
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_VALIDATION");
  });

  it("ignores whitespace-only WIKI_API_URL env override", () => {
    const result = runCli(["--json", "config", "path"], {
      env: { WIKI_API_URL: "   " },
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.config.path.v1");
  });

  it("ignores whitespace-only WIKI_TIMEOUT env override", () => {
    const result = runCli(["--json", "config", "path"], {
      env: { WIKI_TIMEOUT: "   " },
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.config.path.v1");
  });

  it("does not bypass startup config errors for unknown options whose values include `help`", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const configDir = path.join(tmpDir, "wsearch-cli");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "config.json"), "{", "utf8");
    const result = runCli(
      ["--json", "--foo", "help", "config", "path"],
      { env: { XDG_CONFIG_HOME: tmpDir } },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr.trim()).toBe("");
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_INTERNAL");
  });

  it("returns startup E_VALIDATION when config userAgent is not a string", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const configDir = path.join(tmpDir, "wsearch-cli");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "config.json"), JSON.stringify({ userAgent: 123 }), "utf8");
    const result = runCli(["--json", "config", "path"], { env: { XDG_CONFIG_HOME: tmpDir } });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    expect(result.stderr.trim()).toBe("");
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_VALIDATION");
  });

  it("still renders help when config json is corrupted", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const configDir = path.join(tmpDir, "wsearch-cli");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "config.json"), "{", "utf8");
    const result = runCli(["--help"], { env: { XDG_CONFIG_HOME: tmpDir } });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("wsearch [global flags]");
  });

  it("still renders help command with leading global flags when config json is corrupted", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const configDir = path.join(tmpDir, "wsearch-cli");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "config.json"), "{", "utf8");
    const result = runCli(["--json", "help"], { env: { XDG_CONFIG_HOME: tmpDir } });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("wsearch [global flags]");
  });

  it("still renders help when --request-id value starts with a dash via equals form and config json is corrupted", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const configDir = path.join(tmpDir, "wsearch-cli");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "config.json"), "{", "utf8");
    const result = runCli(["--json", "--request-id=-abc", "help"], { env: { XDG_CONFIG_HOME: tmpDir } });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("wsearch [global flags]");
    expect(result.stderr.trim()).toBe("");
  });

  it("still renders help when config timeout is out of range", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const configDir = path.join(tmpDir, "wsearch-cli");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "config.json"), JSON.stringify({ timeout: 2_147_483_648 }), "utf8");
    const result = runCli(["--help"], { env: { XDG_CONFIG_HOME: tmpDir } });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("wsearch [global flags]");
    expect(result.stderr.trim()).toBe("");
  });

  it("still renders help when config userAgent has an invalid type", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const configDir = path.join(tmpDir, "wsearch-cli");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "config.json"), JSON.stringify({ userAgent: 123 }), "utf8");
    const result = runCli(["--help"], { env: { XDG_CONFIG_HOME: tmpDir } });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("wsearch [global flags]");
    expect(result.stderr.trim()).toBe("");
  });

  it("renders nested command help via `help config get`", () => {
    const result = runCli(["help", "config", "get"]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr.trim()).toBe("");
    expect(result.stdout).toContain("wsearch config get <key>");
  });

  it("returns E_USAGE for unknown top-level commands even when trailing help is present", () => {
    const result = runCli(["--json", "logout", "help"]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_USAGE");
    expect(payload.summary).toContain("Unknown argument: logout");
  });

  it("returns E_AUTH when stored credentials cannot be parsed", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const configDir = path.join(tmpDir, "wsearch-cli");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "credentials.json"), "{", "utf8");
    const result = runCli(
      ["--json", "--print-request", "--auth", "entity", "get", "Q42"],
      { env: { XDG_CONFIG_HOME: tmpDir } },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(3);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_AUTH");
  });

  it("returns E_USAGE for raw request paths missing a leading slash", () => {
    const result = runCli([
      "--json",
      "--network",
      "raw",
      "request",
      "GET",
      "entities/items/Q42",
    ]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_USAGE");
  });

  it("returns E_USAGE for raw request paths containing traversal segments", () => {
    const result = runCli([
      "--json",
      "--print-request",
      "raw",
      "request",
      "GET",
      "/../../entities/items/Q42",
    ]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_USAGE");
  });

  it("returns E_USAGE for raw request paths containing encoded separators", () => {
    const result = runCli([
      "--json",
      "--print-request",
      "raw",
      "request",
      "GET",
      "/entities/items/%2F..",
    ]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_USAGE");
    expect(payload.summary).toContain("encoded path separators");
  });

  it("returns E_USAGE for invalid raw request methods", () => {
    const result = runCli([
      "--json",
      "--print-request",
      "raw",
      "request",
      "BAD METHOD",
      "/entities/items/Q42",
    ]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_USAGE");
  });

  it("returns E_USAGE for invalid entity ids in preview mode", () => {
    const result = runCli([
      "--json",
      "--print-request",
      "entity",
      "get",
      "X42",
    ]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_USAGE");
  });

  it("returns E_USAGE for empty action search query", () => {
    const result = runCli([
      "--json",
      "--print-request",
      "action",
      "search",
      "--query",
      "",
      "--limit",
      "1",
    ]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_USAGE");
  });

  it("returns E_USAGE for empty action search language", () => {
    const result = runCli([
      "--json",
      "--print-request",
      "action",
      "search",
      "--query",
      "New York",
      "--language",
      "",
      "--limit",
      "1",
    ]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.error.v1");
    expect(payload.errors?.[0]?.code).toBe("E_USAGE");
  });
});

describe("cli request preview", () => {
  it("prints a request preview without network access", () => {
    const result = runCli([
      "--json",
      "--print-request",
      "entity",
      "get",
      "Q42",
    ]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.request.preview.v1");
    expect(payload.status).toBe("success");
    expect(payload.data.method).toBe("GET");
    expect(payload.data.url).toContain("/w/rest.php/wikibase/v1/entities/items/Q42");
  });

  it("uses --query input for sparql preview and supports --no-input", () => {
    const result = runCli([
      "--json",
      "--no-input",
      "--print-request",
      "sparql",
      "query",
      "--query",
      "SELECT * WHERE { ?s ?p ?o } LIMIT 1",
    ]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.request.preview.v1");
    expect(payload.data.method).toBe("POST");
    expect(payload.data.body).toBe("SELECT * WHERE { ?s ?p ?o } LIMIT 1");
  });

  it("supports `sparql` without a subcommand", () => {
    const result = runCli([
      "--json",
      "--no-input",
      "--print-request",
      "sparql",
      "--query",
      "SELECT * WHERE { ?s ?p ?o } LIMIT 1",
    ]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.request.preview.v1");
    expect(payload.data.method).toBe("POST");
    expect(payload.data.body).toBe("SELECT * WHERE { ?s ?p ?o } LIMIT 1");
  });

  it("resolves raw request preview URLs under the configured API base path", () => {
    const result = runCli([
      "--json",
      "--print-request",
      "raw",
      "request",
      "GET",
      "/entities/items/Q42",
    ]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.request.preview.v1");
    expect(payload.data.url).toContain("/w/rest.php/wikibase/v1/entities/items/Q42");
  });
});

describe("cli config", () => {
  it("sets, gets, and resolves config values", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const env = { XDG_CONFIG_HOME: tmpDir };
    const setResult = runCli(["config", "set", "user-agent", "TestApp/1.0"], {
      env,
    });
    expect(setResult.error).toBeUndefined();
    expect(setResult.status).toBe(0);

    const getResult = runCli(["--json", "config", "get", "user-agent"], {
      env,
    });
    expect(getResult.error).toBeUndefined();
    expect(getResult.status).toBe(0);
    const payload = JSON.parse(getResult.stdout.trim());
    expect(payload.schema).toBe("wiki.config.get.v1");
    expect(payload.data.value).toBe("TestApp/1.0");

    const pathResult = runCli(["--json", "config", "path"], { env });
    expect(pathResult.error).toBeUndefined();
    expect(pathResult.status).toBe(0);
    const pathPayload = JSON.parse(pathResult.stdout.trim());
    expect(pathPayload.data.path).toContain(
      path.join(tmpDir, "wsearch-cli", "config.json"),
    );
  });
});

describe("cli diagnostics", () => {
  it("returns JSON envelope for auth status", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const env = { XDG_CONFIG_HOME: tmpDir };
    const result = runCli(["--json", "auth", "status"], { env });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.auth.status.v1");
    expect(payload.data.authenticated).toBe(false);
    expect(payload.status).toBe("warn");
  });

  it("reports unreadable credentials in auth status without crashing", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const configDir = path.join(tmpDir, "wsearch-cli");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "credentials.json"), "{", "utf8");
    const env = { XDG_CONFIG_HOME: tmpDir };
    const result = runCli(["--json", "auth", "status"], { env });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.auth.status.v1");
    expect(payload.status).toBe("error");
    expect(payload.data.credentialsReadable).toBe(false);
  });

  it("reports structurally invalid credentials in auth status without crashing", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const configDir = path.join(tmpDir, "wsearch-cli");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "credentials.json"), JSON.stringify({ foo: "bar" }), "utf8");
    const env = { XDG_CONFIG_HOME: tmpDir };
    const result = runCli(["--json", "auth", "status"], { env });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.auth.status.v1");
    expect(payload.status).toBe("error");
    expect(payload.data.credentialsReadable).toBe(false);
    expect(payload.data.authenticated).toBe(false);
  });

  it("returns JSON envelope for doctor with config path", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const env = { XDG_CONFIG_HOME: tmpDir };
    const result = runCli(["--json", "doctor"], { env });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.doctor.v1");
    expect(payload.status).toBe("warn");
    expect(payload.data.configPath).toContain(path.join(tmpDir, "wsearch-cli", "config.json"));
    expect(payload.data.encryptedTokenPresent).toBe(false);
  });

  it("treats whitespace-only user-agent as not configured in doctor output", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const configDir = path.join(tmpDir, "wsearch-cli");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "config.json"), JSON.stringify({ userAgent: "   " }), "utf8");
    const env = { XDG_CONFIG_HOME: tmpDir };
    const result = runCli(["--json", "doctor"], { env });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.doctor.v1");
    expect(payload.data.userAgentConfigured).toBe(false);
    expect(payload.status).toBe("warn");
  });

  it("returns error status in doctor when credentials are unreadable", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const configDir = path.join(tmpDir, "wsearch-cli");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "credentials.json"), "{", "utf8");
    const env = { XDG_CONFIG_HOME: tmpDir };
    const result = runCli(["--json", "doctor"], { env });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.doctor.v1");
    expect(payload.status).toBe("error");
    expect(payload.data.credentialsReadable).toBe(false);
  });

  it("populates JSON meta.version from package metadata when npm env is empty", () => {
    const expectedVersion = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    ).version;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const env = { XDG_CONFIG_HOME: tmpDir, npm_package_version: "" };
    const result = runCli(["--json", "auth", "status"], { env });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.meta.version).toBe(expectedVersion);
  });
});

describe("cli stdin handling", () => {
  it("supports token from stdin with passphrase from env", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const result = runCli(
      [
        "--json",
        "--no-input",
        "auth",
        "login",
        "--token-stdin",
        "--passphrase-env",
        "WIKI_PASSPHRASE",
      ],
      {
        env: { XDG_CONFIG_HOME: tmpDir, WIKI_PASSPHRASE: "strong-passphrase" },
        input: "stdin-token",
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.auth.login.v1");
    expect(payload.data.stored).toBe(true);
  });

  it("trims explicit token/passphrase env names before lookup", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const result = runCli(
      [
        "--json",
        "--no-input",
        "auth",
        "login",
        "--token-env",
        " WIKI_TOKEN ",
        "--passphrase-env",
        " WIKI_PASSPHRASE ",
      ],
      {
        env: {
          XDG_CONFIG_HOME: tmpDir,
          WIKI_TOKEN: "trimmed-token",
          WIKI_PASSPHRASE: "trimmed-passphrase",
        },
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.auth.login.v1");
    expect(payload.data.stored).toBe(true);
  });

  it("returns E_USAGE when explicit --token-env variable is missing", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const result = runCli(
      [
        "--json",
        "--no-input",
        "auth",
        "login",
        "--token-env",
        "CUSTOM_TOKEN",
        "--passphrase-env",
        "WIKI_PASSPHRASE",
      ],
      {
        env: { XDG_CONFIG_HOME: tmpDir, WIKI_PASSPHRASE: "strong-passphrase" },
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.errors?.[0]?.code).toBe("E_USAGE");
    expect(payload.summary).toContain("CUSTOM_TOKEN");
  });

  it("returns E_USAGE when explicit --passphrase-env variable is missing", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const result = runCli(
      [
        "--json",
        "--no-input",
        "auth",
        "login",
        "--token-env",
        "WIKI_TOKEN",
        "--passphrase-env",
        "CUSTOM_PASSPHRASE",
      ],
      {
        env: { XDG_CONFIG_HOME: tmpDir, WIKI_TOKEN: "token" },
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.errors?.[0]?.code).toBe("E_USAGE");
    expect(payload.summary).toContain("CUSTOM_PASSPHRASE");
  });

  it("returns E_USAGE for invalid --token-env variable names", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const result = runCli(
      [
        "--json",
        "--no-input",
        "auth",
        "login",
        "--token-env",
        "BAD-NAME",
        "--passphrase-env",
        "WIKI_PASSPHRASE",
      ],
      {
        env: { XDG_CONFIG_HOME: tmpDir, WIKI_PASSPHRASE: "strong-passphrase" },
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.errors?.[0]?.code).toBe("E_USAGE");
    expect(payload.summary).toContain("valid environment variable name");
  });

  it("returns E_USAGE when --token-file is explicitly empty", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const result = runCli(
      [
        "--json",
        "--no-input",
        "auth",
        "login",
        "--token-file",
        "",
        "--passphrase-env",
        "WIKI_PASSPHRASE",
      ],
      {
        env: {
          XDG_CONFIG_HOME: tmpDir,
          WIKI_TOKEN: "fallback-token-should-not-be-used",
          WIKI_PASSPHRASE: "strong-passphrase",
        },
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.errors?.[0]?.code).toBe("E_USAGE");
    expect(payload.summary).toContain("--token-file requires a non-empty file path.");
  });

  it("supports --token-file paths with leading/trailing spaces in filename", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const tokenFilePath = path.join(tmpDir, " token file.txt ");
    fs.writeFileSync(tokenFilePath, "token-from-file", "utf8");
    const result = runCli(
      [
        "--json",
        "--no-input",
        "auth",
        "login",
        "--token-file",
        tokenFilePath,
        "--passphrase-env",
        "WIKI_PASSPHRASE",
      ],
      {
        env: {
          XDG_CONFIG_HOME: tmpDir,
          WIKI_PASSPHRASE: "strong-passphrase",
        },
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.auth.login.v1");
    expect(payload.data.stored).toBe(true);
  });

  it("returns E_USAGE when --passphrase-file is explicitly empty", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const result = runCli(
      [
        "--json",
        "--no-input",
        "auth",
        "login",
        "--token-env",
        "WIKI_TOKEN",
        "--passphrase-file",
        "",
      ],
      {
        env: {
          XDG_CONFIG_HOME: tmpDir,
          WIKI_TOKEN: "token",
          WIKI_PASSPHRASE: "fallback-passphrase-should-not-be-used",
        },
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.errors?.[0]?.code).toBe("E_USAGE");
    expect(payload.summary).toContain("--passphrase-file requires a non-empty file path.");
  });

  it("supports --passphrase-file paths with leading/trailing spaces in filename", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const passphraseFilePath = path.join(tmpDir, " passphrase file.txt ");
    fs.writeFileSync(passphraseFilePath, "strong-passphrase", "utf8");
    const result = runCli(
      [
        "--json",
        "--no-input",
        "auth",
        "login",
        "--token-env",
        "WIKI_TOKEN",
        "--passphrase-file",
        passphraseFilePath,
      ],
      {
        env: {
          XDG_CONFIG_HOME: tmpDir,
          WIKI_TOKEN: "token-from-env",
        },
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.schema).toBe("wiki.auth.login.v1");
    expect(payload.data.stored).toBe(true);
  });

  it("returns E_USAGE when --passphrase-env is explicitly empty", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const result = runCli(
      [
        "--json",
        "--no-input",
        "auth",
        "login",
        "--token-env",
        "WIKI_TOKEN",
        "--passphrase-env",
        "",
      ],
      {
        env: {
          XDG_CONFIG_HOME: tmpDir,
          WIKI_TOKEN: "token",
          WIKI_PASSPHRASE: "fallback-passphrase-should-not-be-used",
        },
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.errors?.[0]?.code).toBe("E_USAGE");
    expect(payload.summary).toContain("--passphrase-env requires a non-empty environment variable name.");
  });
});
