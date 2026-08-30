import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "./api";

const session = { baseUrl: "https://example.test", token: "t" };
const schema = z.object({ ok: z.literal(true) });

function stubFetch(status: number, body: string, type = "text/html"): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(body, { status, headers: { "content-type": type } }),
    ),
  );
}

function call(): ReturnType<typeof apiRequest<{ ok: true }>> {
  return apiRequest({ session, method: "GET", path: "/cli/v1/x", schema });
}

describe("apiRequest", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("decodes a JSON body", async () => {
    stubFetch(200, '{"ok":true}', "application/json");
    const out = await call();
    expect(out.isSuccess && out.value).toEqual({ ok: true });
  });

  it("maps proxy HTML on a 502 to an HTTP error with the status", async () => {
    stubFetch(502, "<html>Bad Gateway</html>");
    const out = await call();
    expect(out.isFailure && out.error.code).toBe("HTTP");
    expect(out.isFailure && out.error.message).toContain(
      "HTTP 502 with an unexpected body",
    );
    expect(out.isFailure && out.error.message).toContain("Try again");
  });

  it("maps HTML on a 200 to PROTOCOL instead of throwing", async () => {
    stubFetch(200, "<html>ok</html>");
    const out = await call();
    expect(out.isFailure && out.error.code).toBe("PROTOCOL");
    expect(out.isFailure && out.error.message).toContain("HTTP 200");
  });

  it("explains a 413 whatever the body is", async () => {
    stubFetch(413, "Request Entity Too Large");
    const out = await call();
    expect(out.isFailure && out.error.code).toBe("HTTP");
    expect(out.isFailure && out.error.message).toContain(
      "inventory is too large",
    );
    expect(out.isFailure && out.error.message).toContain("project roots");
  });

  it("keeps the API error message and the 401 code", async () => {
    stubFetch(
      401,
      '{"code":"UNAUTHORIZED","message":"bad token"}',
      "application/json",
    );
    const out = await call();
    expect(out.isFailure && out.error.code).toBe("UNAUTHORIZED");
    expect(out.isFailure && out.error.message).toContain("bad token");
  });
});
