import { homedir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { upgradeRoots } from "./upgrade";

describe("upgradeRoots", () => {
  it("takes the global root when the directory has no project skills", () => {
    expect(upgradeRoots(resolve("/nowhere"), false, [])).toEqual([
      {
        label: "global",
        cwd: homedir(),
        scope: "-g",
        lockPath: resolve(homedir(), ".agents", ".skill-lock.json"),
      },
    ]);
  });

  it("covers the global root and every registered project with --all", () => {
    const roots = upgradeRoots(resolve("/nowhere"), true, [
      resolve("/a"),
      resolve("/b"),
    ]);

    // `--path` was given, so its directory joins the registered ones even
    // though it holds no skills: `npx skills update` there is a no-op.
    expect(roots.map((root) => root.scope)).toEqual(["-g", "-p", "-p", "-p"]);
    expect(roots.map((root) => root.cwd)).toEqual([
      homedir(),
      resolve("/nowhere"),
      resolve("/a"),
      resolve("/b"),
    ]);
  });

  it("points each project run at its own lock file", () => {
    const [, project] = upgradeRoots(resolve("/nowhere"), true, [
      resolve("/a"),
    ]);

    expect(project?.lockPath).toBe(resolve("/nowhere", "skills-lock.json"));
  });
});
