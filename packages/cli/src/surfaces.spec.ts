import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { projectDirs } from "./surfaces";

describe("projectDirs", () => {
  it("puts the current project first and drops duplicates", () => {
    expect(projectDirs("/a/one", ["/a/two", "/a/one/", "/a/two"])).toEqual([
      resolve("/a/one"),
      resolve("/a/two"),
    ]);
  });

  it("works without a current project", () => {
    expect(projectDirs(undefined, ["/a/two"])).toEqual([resolve("/a/two")]);
  });
});
