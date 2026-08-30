import { describe, expect, it } from "vitest";
import { HANDLE, normalizeHandle, SEGMENT } from "./segments";

describe("HANDLE", () => {
  it("takes 2 to 39 chars starting alphanumeric", () => {
    expect(HANDLE.test("jeje")).toBe(true);
    expect(HANDLE.test("a1")).toBe(true);
    expect(HANDLE.test("a".repeat(39))).toBe(true);
  });

  it("rejects a single char, a leading hyphen, upper case and 40 chars", () => {
    expect(HANDLE.test("a")).toBe(false);
    expect(HANDLE.test("-jeje")).toBe(false);
    expect(HANDLE.test("Jeje")).toBe(false);
    expect(HANDLE.test("a".repeat(40))).toBe(false);
  });
});

describe("SEGMENT", () => {
  it("takes a slug with the id tail and a one-char name", () => {
    expect(SEGMENT.test("acme-inc-clx123")).toBe(true);
    expect(SEGMENT.test("a")).toBe(true);
    expect(SEGMENT.test("a".repeat(80))).toBe(true);
  });

  it("rejects traversal, slashes, a leading hyphen and 81 chars", () => {
    expect(SEGMENT.test("..")).toBe(false);
    expect(SEGMENT.test("a/b")).toBe(false);
    expect(SEGMENT.test("-a")).toBe(false);
    expect(SEGMENT.test("a".repeat(81))).toBe(false);
  });
});

describe("normalizeHandle", () => {
  it("strips a profile URL, an @ and the trailing slash", () => {
    expect(normalizeHandle("https://x.com/jeje_d/")).toBe("jeje_d");
    expect(normalizeHandle("twitter.com/@jeje_d")).toBe("jeje_d");
    expect(normalizeHandle("https://www.linkedin.com/in/jerome-d/")).toBe(
      "jerome-d",
    );
    expect(normalizeHandle(" @jeje ")).toBe("jeje");
  });

  it("leaves a bare handle alone", () => {
    expect(normalizeHandle("jeje-d")).toBe("jeje-d");
  });
});
