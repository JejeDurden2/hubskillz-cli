import { DomainError } from "@hubskillz/shared";

/**
 * Every failure the CLI surfaces. `httpStatus` is inherited from DomainError
 * and unused here: the CLI reports failure with exit code 1 and one line.
 */
export class CliError extends DomainError {
  readonly httpStatus = 500;

  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function toCliError(cause: unknown): CliError {
  if (cause instanceof CliError) return cause;
  if (cause instanceof Error) return new CliError("UNEXPECTED", cause.message);
  return new CliError("UNEXPECTED", String(cause));
}
