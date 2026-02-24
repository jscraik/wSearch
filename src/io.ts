import fs from "fs";
import readline from "readline";

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  const drainBuffered = () => {
    let chunk: string | Buffer | null;
    while ((chunk = process.stdin.read()) !== null) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
  };

  drainBuffered();
  if (process.stdin.readableEnded || process.stdin.destroyed) {
    return Buffer.concat(chunks).toString("utf8");
  }

  return new Promise((resolve, reject) => {
    const onData = (chunk: string | Buffer) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    };
    const onEnd = () => {
      cleanup();
      resolve(Buffer.concat(chunks).toString("utf8"));
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      process.stdin.removeListener("data", onData);
      process.stdin.removeListener("end", onEnd);
      process.stdin.removeListener("error", onError);
    };

    process.stdin.on("data", onData);
    process.stdin.on("end", onEnd);
    process.stdin.on("error", onError);

    if (process.stdin.readableEnded || process.stdin.destroyed) {
      cleanup();
      resolve(Buffer.concat(chunks).toString("utf8"));
    }
  });
}

export function readFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

export async function promptHidden(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
    terminal: true
  });
  const rlAny = rl as unknown as {
    output: NodeJS.WritableStream;
    _writeToOutput?: (text: string) => void;
  };
  const output = rlAny.output;

  rlAny._writeToOutput = (text: string) => {
    if (text === "\n" || text === "\r") {
      output.write(text);
      return;
    }
    if (text === "\b \b") {
      output.write(text);
      return;
    }
    output.write("*");
  };

  try {
    const value = await new Promise<string>((resolve) => {
      rl.question(prompt, (answer) => resolve(answer));
    });
    return value.trim();
  } finally {
    rl.close();
  }
}

export async function promptText(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  const value = await new Promise<string>((resolve) => {
    rl.question(prompt, (answer) => resolve(answer));
  });
  rl.close();
  return value.trim();
}
