import { fetchWithRetry, readBody } from "./http.js";
import { Logger } from "./output.js";

export type EntityType = "items" | "properties" | "lexemes";

export function entityTypeForId(id: string): EntityType {
  if (/^Q\d+$/i.test(id)) return "items";
  if (/^P\d+$/i.test(id)) return "properties";
  if (/^L\d+$/i.test(id)) return "lexemes";
  throw new Error(`Unsupported entity id: ${id}`);
}

export function entityPath(id: string): string {
  const type = entityTypeForId(id);
  return `/entities/${type}/${id.toUpperCase()}`;
}

export function apiPathUrl(apiUrl: string, apiPath: string): string {
  const normalizedPath = apiPath.replace(/^\/+/, "");
  const base = new URL(apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`);
  return new URL(normalizedPath, base).toString();
}

export async function getEntity(
  apiUrl: string,
  id: string,
  headers: HeadersInit,
  logger: Logger,
  opts: { timeout: number; retries: number; retryBackoff: number }
): Promise<unknown> {
  const url = apiPathUrl(apiUrl, entityPath(id));
  const response = await fetchWithRetry(url, { method: "GET", headers }, { ...opts, logger });
  const body = await readBody(response);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

export async function getStatements(
  apiUrl: string,
  id: string,
  headers: HeadersInit,
  logger: Logger,
  opts: { timeout: number; retries: number; retryBackoff: number }
): Promise<unknown> {
  const url = apiPathUrl(apiUrl, `${entityPath(id)}/statements`);
  const response = await fetchWithRetry(url, { method: "GET", headers }, { ...opts, logger });
  const body = await readBody(response);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

export async function actionSearch(
  actionUrl: string,
  query: string,
  language: string,
  limit: number,
  headers: HeadersInit,
  logger: Logger,
  opts: { timeout: number; retries: number; retryBackoff: number }
): Promise<unknown> {
  const url = new URL(actionUrl);
  url.searchParams.set("action", "wbsearchentities");
  url.searchParams.set("search", query);
  url.searchParams.set("language", language);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("format", "json");

  const response = await fetchWithRetry(url.toString(), { method: "GET", headers }, { ...opts, logger });
  const body = await readBody(response);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

export async function sparqlQuery(
  sparqlUrl: string,
  query: string,
  format: "json" | "csv" | "tsv",
  headers: HeadersInit,
  logger: Logger,
  opts: { timeout: number; retries: number; retryBackoff: number }
): Promise<unknown> {
  const accept =
    format === "json"
      ? "application/sparql-results+json"
      : format === "csv"
        ? "text/csv"
        : "text/tab-separated-values";

  const response = await fetchWithRetry(
    sparqlUrl,
    {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/sparql-query",
        accept
      },
      body: query
    },
    { ...opts, logger }
  );
  const body = await readBody(response);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

export async function rawRequest(
  apiUrl: string,
  method: string,
  path: string,
  headers: HeadersInit,
  body: string | undefined,
  logger: Logger,
  opts: { timeout: number; retries: number; retryBackoff: number }
): Promise<unknown> {
  if (!path.startsWith("/")) {
    throw new Error("Path must start with '/'");
  }
  const url = apiPathUrl(apiUrl, path);
  const initHeaders = {
    ...headers,
    ...(body !== undefined ? { "content-type": "application/json" } : {})
  };
  const init: RequestInit = {
    method: method.toUpperCase(),
    headers: initHeaders
  };
  if (body !== undefined) {
    init.body = body;
  }

  const response = await fetchWithRetry(url, init, { ...opts, logger });
  const responseBody = await readBody(response);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}): ${JSON.stringify(responseBody)}`);
  }
  return responseBody;
}
