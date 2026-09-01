import { Result } from "@hubskillz/shared";
import { describe, expect, it } from "vitest";
import { CliError } from "./errors";
import { quickstart, quickstartPending } from "./quickstart";

const config = {
  baseUrl: "https://example.test",
  token: "t",
  machineId: "m",
  projects: [],
};

describe("quickstart", () => {
  it("shows while signed out, marks login done once signed in", () => {
    const out = Result.fail(new CliError("NOT_SIGNED_IN", "no"));
    expect(quickstartPending(out)).toBe(true);
    expect(quickstart(out)).toContain("[ ] Sign in");
    expect(quickstart(Result.ok(config))).toContain("[x] Sign in");
    expect(quickstart(Result.ok(config))).toContain("[ ] Upload");
  });

  it("stops once a sync went through", () => {
    const synced = Result.ok({
      ...config,
      firstSyncAt: "2026-08-28T00:00:00Z",
    });
    expect(quickstartPending(synced)).toBe(false);
  });
});
