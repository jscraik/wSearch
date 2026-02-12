import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

function runCli(args: string[], options?: { env?: NodeJS.ProcessEnv }) {
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

  const result = spawnSync(tsxPath, [cliPath, ...args], {
    encoding: "utf8",
    env: { ...process.env, NODE_NO_WARNINGS: "1", ...options?.env },
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
    expect(payload.data.url).toContain("/entities/items/Q42");
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

  it("rejects NaN timeout value", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const env = { XDG_CONFIG_HOME: tmpDir };
    const configPath = path.join(tmpDir, "wsearch-cli", "config.json");
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ timeout: NaN }));
    
    const result = runCli(["doctor"], { env });
    
    fs.rmSync(tmpDir, { recursive: true, force: true });
    expect(result.stderr).toContain("must be a valid number");
  });
});

describe("cli passphrase validation", () => {
  it("rejects short passphrase from file", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const env = { XDG_CONFIG_HOME: tmpDir };
    const tmpFile = path.join(tmpDir, "token.txt");
    fs.writeFileSync(tmpFile, "short");
    
    const result = runCli(
      [
        "auth",
        "login",
        "--token-file",
        tmpFile,
        "--passphrase-file",
        tmpFile,
        "--non-interactive",
      ],
      { env }
    );
    
    fs.rmSync(tmpDir, { recursive: true, force: true });
    expect(result.stderr).toContain("at least 8 characters");
    expect(result.status).not.toBe(0);
  });

  it("accepts 8-character passphrase", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-"));
    const env = { XDG_CONFIG_HOME: tmpDir };
    const tokenFile = path.join(tmpDir, "token.txt");
    const passFile = path.join(tmpDir, "pass.txt");
    fs.writeFileSync(tokenFile, "test-token-123");
    fs.writeFileSync(passFile, "12345678");
    
    const result = runCli(
      [
        "auth",
        "login",
        "--token-file",
        tokenFile,
        "--passphrase-file",
        passFile,
        "--non-interactive",
      ],
      { env }
    );
    
    fs.rmSync(tmpDir, { recursive: true, force: true });
    expect(result.status).toBe(0);
  });
});
