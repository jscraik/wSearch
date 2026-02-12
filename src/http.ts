import { setTimeout as delay } from "timers/promises";
import { Logger } from "./output.js";

export type HttpOptions = {
  timeout: number;
  retries: number;
  retryBackoff: number;
  logger: Logger;
};

export async function fetchWithRetry(
  input: RequestInfo,
  init: RequestInit,
  options: HttpOptions
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeout);
    try {
      const response = await fetch(input, { ...init, signal: controller.signal });
      clearTimeout(timer);

      if (response.status === 429 || response.status >= 500) {
        const retryAfter = response.headers.get("retry-after");
        let waitMs = options.retryBackoff * (attempt + 1);
        if (retryAfter) {
          const seconds = Number(retryAfter);
          if (!Number.isNaN(seconds)) {
            waitMs = Math.max(0, seconds * 1000);
          } else {
            const dateMs = Date.parse(retryAfter);
            if (!Number.isNaN(dateMs)) {
              waitMs = Math.max(0, dateMs - Date.now());
            }
          }
        }
        if (attempt < options.retries) {
          options.logger.verbose(`Retrying after ${waitMs}ms (status ${response.status})`);
          await delay(waitMs);
          continue;
        }
      }

      return response;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt < options.retries) {
        const waitMs = options.retryBackoff * (attempt + 1);
        options.logger.verbose(`Retrying after ${waitMs}ms (network error)`);
        await delay(waitMs);
        continue;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Network request failed");
}

export async function readBody(response: Response): Promise<unknown> {
  // Handle empty responses (204 No Content, empty body)
  const contentLength = response.headers.get("content-length");
  if (contentLength === "0" || response.status === 204) {
    return null;
  }

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (contentType.includes("application/json") || contentType.includes("+json")) {
    // Check if body is actually empty before parsing
    const text = await response.text();
    if (text.trim().length === 0) {
      return null;
    }
    return JSON.parse(text);
  }
  return response.text();
}
