import { describe, expect, it } from "vitest";
import { readBody } from "../src/http.js";

describe("readBody", () => {
  it("parses +json content types", async () => {
    const payload = { ok: true };
    const response = new Response(JSON.stringify(payload), {
      headers: { "content-type": "application/sparql-results+json; charset=utf-8" }
    });
    const body = await readBody(response);
    expect(body).toEqual(payload);
  });

  describe("empty responses", () => {
    it("handles 204 No Content", async () => {
      const response = new Response(null, { status: 204 });
      const body = await readBody(response);
      expect(body).toBeNull();
    });

    it("handles empty JSON body", async () => {
      const response = new Response("", {
        status: 200,
        headers: { "content-type": "application/json" }
      });
      const body = await readBody(response);
      expect(body).toBeNull();
    });

    it("handles content-length: 0", async () => {
      const response = new Response("", {
        status: 200,
        headers: {
          "content-type": "application/json",
          "content-length": "0"
        }
      });
      const body = await readBody(response);
      expect(body).toBeNull();
    });
  });
});
