import { describe, expect, it } from "vitest";
import {
  canMaintain,
  canVersionAction,
  skillStateAfter,
  versionStateAfter,
  type Actor,
} from "./skill-state";

const member: Actor = { role: "MEMBER", isAuthor: false };
const author: Actor = { role: "MEMBER", isAuthor: true };
const maintainer: Actor = { role: "MAINTAINER", isAuthor: false };
const ownMaintainer: Actor = { role: "MAINTAINER", isAuthor: true };
const admin: Actor = { role: "ADMIN", isAuthor: true };

describe("canMaintain", () => {
  it("covers admins and maintainers only", () => {
    expect(canMaintain("ADMIN")).toBe(true);
    expect(canMaintain("MAINTAINER")).toBe(true);
    expect(canMaintain("MEMBER")).toBe(false);
  });
});

describe("canVersionAction", () => {
  it("proposes a draft, whoever asks", () => {
    expect(canVersionAction("propose", "DRAFT", member)).toBe(true);
    expect(canVersionAction("propose", "DRAFT", author)).toBe(true);
  });

  it("refuses to propose anything that left DRAFT", () => {
    for (const state of [
      "PROPOSED",
      "APPROVED",
      "REJECTED",
      "SUPERSEDED",
    ] as const) {
      expect(canVersionAction("propose", state, maintainer)).toBe(false);
    }
  });

  it("approves only a proposed version, and only for a maintainer", () => {
    expect(canVersionAction("approve", "PROPOSED", maintainer)).toBe(true);
    expect(canVersionAction("approve", "PROPOSED", member)).toBe(false);
    expect(canVersionAction("approve", "DRAFT", maintainer)).toBe(false);
  });

  it("lets only an admin approve straight from DRAFT", () => {
    expect(canVersionAction("approve", "DRAFT", admin)).toBe(true);
    expect(
      canVersionAction("approve", "DRAFT", { role: "ADMIN", isAuthor: false }),
    ).toBe(true);
    expect(canVersionAction("approve", "DRAFT", ownMaintainer)).toBe(false);
    expect(canVersionAction("approve", "DRAFT", member)).toBe(false);
    expect(canVersionAction("approve", "DRAFT", author)).toBe(false);
  });

  it("blocks a maintainer on their own version and lets an admin through", () => {
    expect(canVersionAction("approve", "PROPOSED", ownMaintainer)).toBe(false);
    expect(canVersionAction("approve", "PROPOSED", admin)).toBe(true);
  });

  it("rejects a proposed version, own one included", () => {
    expect(canVersionAction("reject", "PROPOSED", ownMaintainer)).toBe(true);
    expect(canVersionAction("reject", "PROPOSED", member)).toBe(false);
    expect(canVersionAction("reject", "APPROVED", maintainer)).toBe(false);
  });
});

describe("versionStateAfter", () => {
  it("maps every action", () => {
    expect(versionStateAfter("propose")).toBe("PROPOSED");
    expect(versionStateAfter("approve")).toBe("APPROVED");
    expect(versionStateAfter("reject")).toBe("REJECTED");
  });
});

describe("skillStateAfter", () => {
  it("moves a fresh skill to PROPOSED with its first version", () => {
    expect(skillStateAfter("propose", "DRAFT", false)).toBe("PROPOSED");
  });

  it("leaves an approved skill alone while a new version is in review", () => {
    expect(skillStateAfter("propose", "APPROVED", true)).toBe(null);
  });

  it("approves the skill with the version", () => {
    expect(skillStateAfter("approve", "PROPOSED", false)).toBe("APPROVED");
  });

  it("changes nothing on a rejection", () => {
    expect(skillStateAfter("reject", "PROPOSED", false)).toBe(null);
  });
});
