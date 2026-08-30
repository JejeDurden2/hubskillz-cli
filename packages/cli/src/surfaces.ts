import { resolve } from "node:path";
import {
  exists,
  globalSkillsRoot,
  globalSurfaceLabel,
  projectSkillsRoot,
  projectSurfaceLabel,
  scanSurface,
} from "./scan";
import type { Surface } from "./scan";
import { dim } from "./output";

/**
 * The Claude Code local surfaces to act on.
 *
 * `both` scans the global root, the project one, and every registered project
 * (see `hubskillz projects`). Otherwise the project root wins when it exists,
 * and the global root is the fallback.
 */
export async function localSurfaces(
  path: string | undefined,
  both: boolean,
  machineId: string,
  registered: readonly string[] = [],
): Promise<readonly Surface[]> {
  const projectDir = resolve(path ?? process.cwd());
  const projectRoot = projectSkillsRoot(projectDir);
  const hasProject = exists(projectRoot);

  const project = async (dir: string): Promise<Surface> =>
    scanSurface(
      projectSkillsRoot(dir),
      projectSurfaceLabel(dir),
      machineId,
      "project",
    );
  const global = async (): Promise<Surface> =>
    scanSurface(globalSkillsRoot(), globalSurfaceLabel(), machineId, "global");

  if (!both) return [hasProject ? await project(projectDir) : await global()];

  const surfaces = [await global()];
  const dirs = projectDirs(
    hasProject || path !== undefined ? projectDir : undefined,
    registered,
  );
  for (const dir of dirs) {
    if (exists(projectSkillsRoot(dir))) {
      surfaces.push(await project(dir));
      continue;
    }
    process.stdout.write(
      dim(
        `skipping ${dir}: no .claude/skills here, run \`hubskillz projects remove ${dir}\` to forget it\n`,
      ),
    );
  }
  return surfaces;
}

/** Current project first, then registered ones, each path once. */
export function projectDirs(
  current: string | undefined,
  registered: readonly string[],
): readonly string[] {
  const dirs = [current, ...registered]
    .filter((dir) => dir !== undefined)
    .map((dir) => resolve(dir));
  return [...new Set(dirs)];
}
