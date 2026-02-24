import { setTimeout as delay } from "timers/promises";
import { Logger } from "./output.js";

export type HttpOptions = {
  timeout: number;
  retries: number;
  retryBackoff: number;
  logger: Logger;
};

const MAX_TIMER_MS = 2_147_483_647;

export async function fetchWithRetry(
  input: RequestInfo,
  init: RequestInit,
  options: HttpOptions
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    const controller = new AbortController();
    const detachUpstreamAbort = forwardAbort(init.signal, controller);
    const timeoutMs = normalizeTimerMs(options.timeout);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(input, { ...init, signal: controller.signal });

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
          try {
            await response.body?.cancel();
          } catch (_error) {
            // ignore best-effort body cancellation failures
          }
          const normalizedWaitMs = normalizeTimerMs(waitMs);
          options.logger.verbose(`Retrying after ${normalizedWaitMs}ms (status ${response.status})`);
          await waitWithAbort(normalizedWaitMs, init.signal);
          continue;
        }
      }

      return response;
    } catch (error) {
      lastError = error;
      if (init.signal?.aborted) {
        throw error;
      }
      if (attempt < options.retries) {
        const waitMs = normalizeTimerMs(options.retryBackoff * (attempt + 1));
        options.logger.verbose(`Retrying after ${waitMs}ms (network error)`);
        await waitWithAbort(waitMs, init.signal);
        continue;
      }
    } finally {
      clearTimeout(timer);
      detachUpstreamAbort();
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Network request failed");
}

export async function readBody(response: Response): Promise<unknown> {
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  const bodyText = await response.text();
  if (contentType.includes("application/json") || contentType.includes("+json")) {
    if (bodyText.trim().length === 0) {
      return null;
    }
    try {
      return JSON.parse(bodyText) as unknown;
    } catch (_error) {
      return bodyText;
    }
  }
  return bodyText;
}

function forwardAbort(signal: AbortSignal | null | undefined, controller: AbortController): () => void {
  if (!signal) {
    return () => {};
  }
  if (signal.aborted) {
    controller.abort();
    return () => {};
  }
  const onAbort = () => controller.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  return () => signal.removeEventListener("abort", onAbort);
}

async function waitWithAbort(ms: number, signal: AbortSignal | null | undefined): Promise<void> {
  if (ms <= 0) {
    return;
  }
  if (!signal) {
    await delay(ms);
    return;
  }
  if (signal.aborted) {
    throw createAbortError();
  }
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(createAbortError());
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function createAbortError(): Error {
  try {
    return new DOMException("The operation was aborted.", "AbortError");
  } catch (_error) {
    const fallback = new Error("The operation was aborted.");
    fallback.name = "AbortError";
    return fallback;
  }
}

function normalizeTimerMs(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  if (value > MAX_TIMER_MS) {
    return MAX_TIMER_MS;
  }
  return Math.floor(value);
}
