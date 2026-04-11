/**
 * CLI Error handling with agent-friendly features
 */

export class CliError extends Error {
  exitCode: number;
  code: string;

  constructor(message: string, exitCode = 1, code = "E_INTERNAL") {
    super(message);
    this.exitCode = exitCode;
    this.code = code;
  }
}

export function isCliError(error: unknown): error is CliError {
  return error instanceof CliError;
}
