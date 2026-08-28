import { Result, apiErrorSchema } from "@hubskillz/shared";
import type {
  AdoptRequest,
  DraftRequest,
  InventoryRequest,
} from "@hubskillz/shared";
import type { ZodType } from "zod";
import { CliError } from "./errors";

export interface Session {
  readonly baseUrl: string;
  readonly token: string;
}

export interface ApiRequest<T> {
  readonly session: Session;
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly schema: ZodType<T>;
  readonly body?: InventoryRequest | DraftRequest | AdoptRequest;
}

export async function apiRequest<T>(
  request: ApiRequest<T>,
): Promise<Result<T>> {
  const url = `${request.session.baseUrl}${request.path}`;
  const bearer = `Bearer ${request.session.token}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: request.method,
      headers:
        request.body === undefined
          ? { accept: "application/json", authorization: bearer }
          : {
              accept: "application/json",
              authorization: bearer,
              "content-type": "application/json",
            },
      body:
        request.body === undefined ? undefined : JSON.stringify(request.body),
    });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return Result.fail(
      new CliError("NETWORK", `Cannot reach ${url}: ${detail}`),
    );
  }

  const text = await response.text();

  if (!response.ok) {
    const message =
      decodeBody(text, apiErrorSchema)?.message ??
      `${response.status} ${response.statusText}`;
    return Result.fail(
      new CliError(
        response.status === 401
          ? "UNAUTHORIZED"
          : response.status === 403
            ? "FORBIDDEN"
            : "HTTP",
        `${request.method} ${request.path} failed: ${message}`,
      ),
    );
  }

  const parsed = decodeBody(text, request.schema);
  if (parsed === null) {
    return Result.fail(
      new CliError(
        "PROTOCOL",
        `${request.method} ${request.path} returned an unexpected payload.`,
      ),
    );
  }
  return Result.ok(parsed);
}

/** JSON in, domain type out. Null when the body is not what the schema wants. */
function decodeBody<T>(text: string, schema: ZodType<T>): T | null {
  const parsed = schema.safeParse(JSON.parse(text === "" ? "null" : text));
  return parsed.success ? parsed.data : null;
}
