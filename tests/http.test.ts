import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry, readBody } from "../src/http.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("readBody", () => {
  it("parses +json content types", async () => {
    const payload = { ok: true };
    const response = new Response(JSON.stringify(payload), {
      headers: { "content-type": "application/sparql-results+json; charset=utf-8" }
    });
    const body = await readBody(response);
    expect(body).toEqual(payload);
  });

  it("returns raw text when json content-type has invalid json", async () => {
    const response = new Response("{invalid", {
      headers: { "content-type": "application/json" }
    });
    const body = await readBody(response);
    expect(body).toBe("{invalid");
  });

  it("returns null for empty json bodies", async () => {
    const response = new Response("", {
      headers: { "content-type": "application/json" }
    });
    const body = await readBody(response);
    expect(body).toBeNull();
  });
});

describe("fetchWithRetry", () => {
  it("does not retry when upstream abort signal is aborted", async () => {
    const upstream = new AbortController();
    upstream.abort();
    const fetchMock = vi.fn(async () => {
      throw new DOMException("Aborted", "AbortError");
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(
      fetchWithRetry(
        "https://example.org",
        { method: "GET", signal: upstream.signal },
        {
          timeout: 100,
          retries: 3,
          retryBackoff: 0,
          logger: { info: () => {}, verbose: () => {}, debug: () => {}, error: () => {} }
        }
      )
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries network failures up to configured attempts", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(
      fetchWithRetry(
        "https://example.org",
        { method: "GET" },
        {
          timeout: 100,
          retries: 2,
          retryBackoff: 0,
          logger: { info: () => {}, verbose: () => {}, debug: () => {}, error: () => {} }
        }
      )
    ).rejects.toThrow(/network down/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("stops during retry backoff when upstream signal aborts", async () => {
    const upstream = new AbortController();
    const fetchMock = vi.fn(async () => {
      return new Response("{}", {
        status: 500,
        headers: { "content-type": "application/json" }
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;
    setTimeout(() => upstream.abort(), 10);

    await expect(
      fetchWithRetry(
        "https://example.org",
        { method: "GET", signal: upstream.signal },
        {
          timeout: 1000,
          retries: 3,
          retryBackoff: 500,
          logger: { info: () => {}, verbose: () => {}, debug: () => {}, error: () => {} }
        }
      )
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clamps oversized retry-after values to a safe timer range", async () => {
    const upstream = new AbortController();
    const messages: string[] = [];
    const fetchMock = vi.fn(async () => {
      return new Response("{}", {
        status: 503,
        headers: {
          "content-type": "application/json",
          "retry-after": "9999999999"
        }
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;
    setTimeout(() => upstream.abort(), 10);

    await expect(
      fetchWithRetry(
        "https://example.org",
        { method: "GET", signal: upstream.signal },
        {
          timeout: 1000,
          retries: 1,
          retryBackoff: 0,
          logger: {
            info: () => {},
            verbose: (msg: string) => messages.push(msg),
            debug: () => {},
            error: () => {}
          }
        }
      )
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(messages).toContain("Retrying after 2147483647ms (status 503)");
  });
});
