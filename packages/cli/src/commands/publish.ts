import { Result, publishResponseSchema } from "@hubskillz/shared";
import { apiRequest } from "../api";
import type { Session } from "../api";
import { readConfig, resolveBaseUrl, webOrigin } from "../config";
import { dim } from "../output";

export interface PublishOptions {
  readonly baseUrl: string | undefined;
  readonly name: string;
  readonly published: boolean;
}

/**
 * `hubskillz publish|unpublish <skill>`: the skill's place on the caller's
 * public page. Publishing a skill the whole org can see is what makes it
 * readable by a stranger, so the confirmation carries the link.
 */
export async function publish(options: PublishOptions): Promise<Result<void>> {
  const config = await readConfig();
  if (config.isFailure) return Result.fail(config.error);
  const session: Session = {
    baseUrl: resolveBaseUrl(options.baseUrl, config.value.baseUrl),
    token: config.value.token,
  };

  const result = await apiRequest({
    session,
    method: "POST",
    path: "/api/cli/publish",
    schema: publishResponseSchema,
    body: { name: options.name, published: options.published },
  });
  if (result.isFailure) return Result.fail(result.error);

  const page = `${webOrigin(session.baseUrl)}/@${result.value.handle}`;
  process.stdout.write(
    options.published
      ? `${options.name} is public on ${page}\n`
      : `${options.name} is off your public page.\n${dim(page)}\n`,
  );
  return Result.ok(undefined);
}
