import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sync } from "./sync";

interface Call {
  readonly url: string;
  readonly method: string;
}

let home = "";
let project = "";
let previousHome: string | undefined;
let calls: Call[] = [];
let written = "";

const inventoryPayload = {
  surfaceId: "surface-1",
  items: [
    {
      name: "alpha",
      state: "drifted",
      installedHash: "hash-1",
      approvedVersionId: "ver-2",
      approvedVersion: 2,
      required: false,
      importable: false,
    },
  ],
};

type Payload =
  | typeof inventoryPayload
  | { requests: readonly { id: string; skillName: string }[] }
  | {
      adopted: readonly string[];
      skipped: readonly { name: string; code: string }[];
    }
  | { ok: boolean };

function json(body: Payload): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function stubFetch(
  adopt?: (url: string, init: RequestInit) => Response | undefined,
): void {
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method ?? "GET" });
    const special = adopt?.(url, init);
    if (special !== undefined) return Promise.resolve(special);
    if (url.includes("/api/cli/inventory")) {
      return Promise.resolve(json(inventoryPayload));
    }
    if (url.includes("/api/cli/pending")) {
      return Promise.resolve(json({ requests: [] }));
    }
    throw new Error(`unexpected call ${url}`);
  });
}

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "hubskillz-home-"));
  project = await mkdtemp(join(tmpdir(), "hubskillz-project-"));
  previousHome = process.env["HOME"];
  process.env["HOME"] = home;
  calls = [];
  written = "";
  inventoryPayload.items[0] = {
    ...inventoryPayload.items[0]!,
    importable: false,
  };

  await mkdir(join(home, ".hubskillz"), { recursive: true });
  await writeFile(
    join(home, ".hubskillz", "config.json"),
    JSON.stringify({
      baseUrl: "https://example.test",
      token: "device-token",
      machineId: "machine-1",
    }),
    "utf8",
  );

  await mkdir(join(project, ".claude", "skills", "alpha"), { recursive: true });
  await writeFile(
    join(project, ".claude", "skills", "alpha", "SKILL.md"),
    "# alpha v1\n",
    "utf8",
  );

  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    written += String(chunk);
    return true;
  });
  stubFetch();
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (previousHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = previousHome;
  await rm(home, { recursive: true, force: true });
  await rm(project, { recursive: true, force: true });
});

const options = { baseUrl: undefined, path: "", all: false, yes: false };

describe("sync", () => {
  it("uploads the inventory, reports states and writes no local file", async () => {
    const result = await sync({ ...options, path: project });

    expect(result.isSuccess).toBe(true);
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "POST https://example.test/api/cli/inventory",
      "GET https://example.test/api/cli/pending?surfaceId=surface-1",
    ]);
    expect(written).toContain("alpha");
    expect(written).toContain("drifted");
    // The skill on disk is untouched: sync is an upload, never a write.
    expect(
      await readFile(
        join(project, ".claude", "skills", "alpha", "SKILL.md"),
        "utf8",
      ),
    ).toBe("# alpha v1\n");
    expect(existsSync(join(project, ".claude", "skills", "beta"))).toBe(false);
  });

  it("drains the pending sync requests of the surface", async () => {
    stubFetch((url) => {
      if (url.includes("/api/cli/pending?")) {
        return json({ requests: [{ id: "req-1", skillName: "alpha" }] });
      }
      if (url.includes("/api/cli/pending/req-1/applied")) {
        return json({ ok: true });
      }
      return undefined;
    });

    const result = await sync({ ...options, path: project });

    expect(result.isSuccess).toBe(true);
    expect(
      calls.some((call) => call.url.includes("/api/cli/pending/req-1/applied")),
    ).toBe(true);
  });
});

describe("sync adopt", () => {
  beforeEach(() => {
    inventoryPayload.items[0] = {
      ...inventoryPayload.items[0]!,
      importable: true,
    };
  });

  it("adds importable skills to the directory without asking", async () => {
    stubFetch((url) => {
      if (!url.includes("/api/cli/adopt")) return undefined;
      return json({ adopted: ["alpha"], skipped: [] });
    });

    const result = await sync({ ...options, path: project });

    expect(result.isSuccess).toBe(true);
    expect(calls.some((call) => call.url.includes("/api/cli/adopt"))).toBe(
      true,
    );
    expect(written).toContain("added 1 skill to your directory: alpha");
    // Adopted, so the inventory is posted again for a fresh report.
    expect(
      calls.filter((call) => call.url.includes("/api/cli/inventory")),
    ).toHaveLength(2);
  });

  it("keeps syncing when adopting is refused to a member", async () => {
    stubFetch((url) => {
      if (!url.includes("/api/cli/adopt")) return undefined;
      return new Response(
        JSON.stringify({ code: "FORBIDDEN", message: "no" }),
        { status: 403, headers: { "content-type": "application/json" } },
      );
    });

    const result = await sync({ ...options, path: project });

    expect(result.isSuccess).toBe(true);
    expect(written).toContain("ask a maintainer to adopt these skills");
    expect(calls.some((call) => call.url.includes("/api/cli/pending"))).toBe(
      true,
    );
  });
});
