import type { InventoryItem } from "@hubskillz/shared";
import { describe, expect, it } from "vitest";
import { mergeItems, reviewUrl } from "./status";

function item(name: string, extra: Partial<InventoryItem> = {}): InventoryItem {
  return {
    name,
    state: "missing",
    required: true,
    importable: false,
    ...extra,
  };
}

describe("mergeItems", () => {
  it("lets the chunk holding the skill decide its state", () => {
    // Every chunk is answered against the whole directory, so the chunk that
    // did not carry `alpha` reports it with no hash. Trusting that one would
    // plan a removal or an overwrite of the copy the other chunk found.
    const merged = mergeItems([
      item("alpha", { state: "inherited" }),
      item("beta", { state: "synced", installedHash: "hash-b" }),
      item("alpha", { state: "customized", installedHash: "hash-a" }),
    ]);

    expect(merged).toEqual([
      item("alpha", { state: "customized", installedHash: "hash-a" }),
      item("beta", { state: "synced", installedHash: "hash-b" }),
    ]);
  });

  it("keeps a skill no chunk holds, and reports it once", () => {
    const merged = mergeItems([item("gamma"), item("gamma")]);

    expect(merged).toEqual([item("gamma")]);
  });
});

describe("reviewUrl", () => {
  it("turns the hosted api base into the web app it belongs to", () => {
    expect(reviewUrl("https://api.hubskillz.com")).toBe(
      "https://hubskillz.com/app",
    );
  });

  it("keeps a self-hosted base as it is", () => {
    expect(reviewUrl("http://localhost:3000")).toBe(
      "http://localhost:3000/app",
    );
  });
});
