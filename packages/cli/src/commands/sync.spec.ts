import { existsSync } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
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

const approvedPayload = {
  skills: [
    {
      name: "alpha",
      versionId: "ver-2",
      version: 2,
      contentHash: "hash-2",
      blocked: false,
      files: [
        { path: "SKILL.md", content: "# alpha v2\n" },
        { path: "ref/new.md", content: "new\n" },
      ],
    },
    {
      name: "beta",
      versionId: "ver-9",
      version: 9,
      contentHash: "hash-9",
      blocked: false,
      files: [{ path: "SKILL.md", content: "# beta\n" }],
    },
  ],
};

const inventoryPayload = {
  surfaceId: "surface-1",
  items: [
    {
      name: "alpha",
      state: "drifted",
      installedHash: "hash-1",
      approvedVersionId: "ver-2",
      approvedVersion: 2,
      required: true,
      importable: false,
    },
    {
      name: "beta",
      state: "missing",
      approvedVersion: 9,
      required: true,
      importable: false,
    },
  ],
};

function json(
  body: typeof inventoryPayload | typeof approvedPayload | { requests: [] },
): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "hubskillz-home-"));
  project = await mkdtemp(join(tmpdir(), "hubskillz-project-"));
  previousHome = process.env["HOME"];
  process.env["HOME"] = home;
  calls = [];
  written = "";

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
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method ?? "GET" });
    if (url.includes("/api/cli/inventory")) {
      return Promise.resolve(json(inventoryPayload));
    }
    if (url.includes("/api/cli/approved")) {
      return Promise.resolve(json(approvedPayload));
    }
    if (url.includes("/api/cli/pending")) {
      return Promise.resolve(json({ requests: [] }));
    }
    throw new Error(`unexpected call ${url}`);
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (previousHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = previousHome;
  await rm(home, { recursive: true, force: true });
  await rm(project, { recursive: true, force: true });
});

describe("sync --dry-run", () => {
  it("reports the plan and writes nothing", async () => {
    const result = await sync({
      baseUrl: undefined,
      path: project,
      all: false,
      adopt: false,
      yes: false,
      dryRun: true,
      force: false,
    });

    expect(result.isSuccess).toBe(true);
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "POST https://example.test/api/cli/inventory",
      "GET https://example.test/api/cli/approved?surfaceId=surface-1",
    ]);
    expect(written).toContain("update");
    expect(written).toContain("alpha");
    expect(written).toContain("+ alpha/ref/new.md");
    expect(written).toContain("~ alpha/SKILL.md");
    expect(written).toContain("install");
    expect(written).toContain("beta");
    expect(
      await readFile(
        join(project, ".claude", "skills", "alpha", "SKILL.md"),
        "utf8",
      ),
    ).toBe("# alpha v1\n");
    await expect(
      readFile(join(project, ".claude", "skills", "beta", "SKILL.md"), "utf8"),
    ).rejects.toThrow();
  });
});

/** Replaces the on-disk alpha with a symlink to `target`. */
async function linkAlpha(target: string): Promise<string> {
  const link = join(project, ".claude", "skills", "alpha");
  await rm(link, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await writeFile(join(target, "SKILL.md"), "# alpha v1\n", "utf8");
  await symlink(target, link, "dir");
  return link;
}

const apply = {
  baseUrl: undefined,
  path: "",
  all: false,
  adopt: false,
  yes: true,
  dryRun: false,
  force: false,
};

describe("sync adopt", () => {
  it("keeps syncing when adopting is refused", async () => {
    inventoryPayload.items[0] = {
      ...inventoryPayload.items[0]!,
      importable: true,
    };
    const base = fetch;
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      if (!url.includes("/api/cli/adopt")) return base(url, init);
      calls.push({ url, method: init.method ?? "GET" });
      return Promise.resolve(
        new Response(JSON.stringify({ code: "FORBIDDEN", message: "no" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        }),
      );
    });

    const result = await sync({ ...apply, path: project, adopt: true });

    expect(result.isSuccess).toBe(true);
    expect(written).toContain("ask a maintainer to adopt these skills");
    expect(calls.some((call) => call.url.includes("/api/cli/approved"))).toBe(
      true,
    );
  });
});

describe("sync apply", () => {
  it("writes through a symlinked skill into its target", async () => {
    const canonical = join(home, ".agents", "skills", "alpha");
    const link = await linkAlpha(canonical);

    const result = await sync({ ...apply, path: project });

    expect(result.isSuccess).toBe(true);
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    expect(await readFile(join(canonical, "SKILL.md"), "utf8")).toBe(
      "# alpha v2\n",
    );
  });

  it("refuses a symlink that leaves the home dir", async () => {
    const outside = await mkdtemp(join(tmpdir(), "hubskillz-outside-"));
    await linkAlpha(join(outside, "alpha"));

    const result = await sync({ ...apply, path: project });

    expect(result.isFailure).toBe(true);
    expect(result.error.code).toBe("UNSAFE_LINK");
    expect(await readFile(join(outside, "alpha", "SKILL.md"), "utf8")).toBe(
      "# alpha v1\n",
    );
    await rm(outside, { recursive: true, force: true });
  });

  it("skips a skill holding a nested symlink to a file outside home", async () => {
    const outside = await mkdtemp(join(tmpdir(), "hubskillz-outside-"));
    await writeFile(join(outside, "SKILL.md"), "# outside\n", "utf8");
    const alpha = join(project, ".claude", "skills", "alpha");
    await mkdir(join(alpha, "ref"), { recursive: true });
    await symlink(join(outside, "SKILL.md"), join(alpha, "ref", "new.md"));

    const result = await sync({ ...apply, path: project });

    expect(result.isSuccess).toBe(true);
    expect(written).toContain("alpha: contains a symlink, refusing to write");
    expect(written).toContain("installed beta v9");
    expect(await readFile(join(outside, "SKILL.md"), "utf8")).toBe(
      "# outside\n",
    );
    expect(await readFile(join(alpha, "SKILL.md"), "utf8")).toBe(
      "# alpha v1\n",
    );
    await rm(outside, { recursive: true, force: true });
  });

  it("prints origin, blocked and upstream notes", async () => {
    approvedPayload.skills[1] = {
      ...approvedPayload.skills[1]!,
      blocked: true,
      blockedReason: "Snyk: fail",
      files: [],
    };
    inventoryPayload.items[0] = {
      ...inventoryPayload.items[0]!,
      upstreamAhead: true,
    };

    await sync({ ...apply, path: project, dryRun: true });

    expect(written).toContain("private");
    expect(written).toContain("org policy: Snyk: fail");
    expect(written).toContain(
      "upstream ahead of approved version, waiting for review: alpha (private)",
    );
    expect(written).not.toContain("install");
  });
});

describe("sync inherited", () => {
  const alphaDir = (): string => join(project, ".claude", "skills", "alpha");

  // Own payloads: the tests above mutate the shared fixtures in place.
  function stubInherited(): void {
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      calls.push({ url, method: init.method ?? "GET" });
      if (url.includes("/api/cli/inventory")) {
        return Promise.resolve(
          json({
            surfaceId: "surface-1",
            items: [
              {
                name: "alpha",
                state: "inherited",
                installedHash: "hash-1",
                approvedVersionId: "ver-2",
                approvedVersion: 2,
                required: true,
                importable: false,
              },
            ],
          }),
        );
      }
      if (url.includes("/api/cli/approved")) {
        return Promise.resolve(
          json({
            skills: [
              {
                name: "alpha",
                versionId: "ver-2",
                version: 2,
                contentHash: "hash-2",
                blocked: false,
                files: [{ path: "SKILL.md", content: "# alpha v2\n" }],
              },
            ],
          }),
        );
      }
      if (url.includes("/api/cli/pending")) {
        return Promise.resolve(json({ requests: [] }));
      }
      throw new Error(`unexpected call ${url}`);
    });
  }

  it("removes the project copy the global root already covers", async () => {
    await mkdir(join(home, ".claude", "skills", "alpha"), { recursive: true });
    await writeFile(
      join(home, ".claude", "skills", "alpha", "SKILL.md"),
      "# alpha v2\n",
      "utf8",
    );
    stubInherited();

    const result = await sync({ ...apply, path: project });

    expect(result.isSuccess).toBe(true);
    expect(existsSync(alphaDir())).toBe(false);
    expect(written).toContain(
      "removed alpha (inherited from ~/.claude/skills)",
    );
    // The global copy is the one that matters: it stays.
    expect(
      existsSync(join(home, ".claude", "skills", "alpha", "SKILL.md")),
    ).toBe(true);
  });

  it("keeps the copy when the global root no longer has the skill", async () => {
    stubInherited();

    const result = await sync({ ...apply, path: project });

    expect(result.isSuccess).toBe(true);
    expect(existsSync(join(alphaDir(), "SKILL.md"))).toBe(true);
    expect(written).toContain("no longer in ~/.claude/skills");
  });
});
