export type OutputMode = "plain" | "json";

export type JsonEnvelope<T> = {
  schema: string;
  meta: {
    tool: string;
    version: string;
    timestamp: string;
    request_id?: string;
  };
  summary: string;
  status: "success" | "warn" | "error";
  data: T;
  errors: Array<{ message: string; code?: string }>;
};

export type LogLevel = "quiet" | "info" | "verbose" | "debug";

export type CliGlobals = {
  json: boolean;
  plain: boolean;
  output?: string;
  quiet: boolean;
  verbose: boolean;
  debug: boolean;
  nonInteractive: boolean;
  network: boolean;
  auth: boolean;
  requestId?: string;
  printRequest: boolean;
  passphraseFile?: string;
  passphraseStdin?: boolean;
  passphraseEnv?: string;
  userAgent?: string;
  apiUrl: string;
  actionUrl: string;
  sparqlUrl: string;
  timeout: number;
  retries: number;
  retryBackoff: number;
};
