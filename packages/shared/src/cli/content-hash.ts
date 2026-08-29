import { createHash } from "node:crypto";

export interface SkillFileContent {
  readonly path: string;
  readonly content: string;
}

/**
 * Canonical skill content hash, shared by web and CLI.
 * sha256 over files sorted by path, each contributing
 * `path + "\0" + content + "\0"`.
 */
export function contentHash(files: readonly SkillFileContent[]): string {
  const hash = createHash("sha256");
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : 1));
  for (const file of sorted) {
    hash.update(`${file.path}\0${file.content}\0`);
  }
  return hash.digest("hex");
}
