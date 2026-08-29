import { Result, draftResponseSchema } from "@hubskillz/shared";
import type { DraftRequest } from "@hubskillz/shared";
import { apiRequest } from "../api";
import type { Session } from "../api";
import { readConfig, resolveBaseUrl } from "../config";
import { CliError } from "../errors";
import { dim } from "../output";
import { scanSkillDir } from "../scan";

export interface PushOptions {
  readonly baseUrl: string | undefined;
  readonly dir: string;
  readonly message: string | undefined;
}

export async function push(options: PushOptions): Promise<Result<void>> {
  const config = await readConfig();
  if (config.isFailure) return Result.fail(config.error);
  const session: Session = {
    baseUrl: resolveBaseUrl(options.baseUrl, config.value.baseUrl),
    token: config.value.token,
  };

  const skill = await scanSkillDir(options.dir);
  if (skill === null) {
    return Result.fail(
      new CliError("EMPTY_SKILL", `No readable file in ${options.dir}.`),
    );
  }

  const body: DraftRequest = {
    name: skill.name,
    files: skill.files.map((file) => ({
      path: file.path,
      content: file.content,
    })),
  };
  if (options.message !== undefined) body.message = options.message;

  const draft = await apiRequest({
    session,
    method: "POST",
    path: "/api/cli/drafts",
    schema: draftResponseSchema,
    body,
  });
  if (draft.isFailure) return Result.fail(draft.error);

  process.stdout.write(
    `Pushed ${skill.name} (${skill.files.length} files) as a draft.\n` +
      `${dim(`skill ${draft.value.skillId} version ${draft.value.versionId}`)}\n`,
  );
  return Result.ok(undefined);
}
