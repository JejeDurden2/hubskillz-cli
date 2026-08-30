import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { exists, projectSkillsRoot } from "./scan";

const SKIP = new Set(["node_modules", ".git", "Library", ".Trash", ".cache"]);

/**
 * Directories under `roots` that hold a `.claude/skills` folder, at most
 * `maxDepth` levels down. The roots themselves are excluded, so the global
 * `~/.claude/skills` never counts as a project.
 */
export async function discoverProjects(
  roots: readonly string[] = [homedir()],
  maxDepth = 3,
): Promise<readonly string[]> {
  const found = new Set<string>();
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // ponytail: EACCES/ENOENT are expected under $HOME, skip silently
    }
    for (const entry of entries) {
      const name = entry.name;
      if (!entry.isDirectory() || SKIP.has(name)) continue;
      if (name.startsWith(".") && name !== ".claude") continue;
      const child = join(dir, name);
      if (name === ".claude" && depth > 0) {
        if (exists(projectSkillsRoot(dir))) found.add(dir);
        continue;
      }
      await walk(child, depth + 1);
    }
  };
  for (const root of roots) await walk(resolve(root), 0);
  return [...found].sort();
}
