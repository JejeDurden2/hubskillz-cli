// What a stranger may address. The api validates every public route segment
// with these, and the web checks the same shape before it calls, so a bad
// segment never becomes a request. One declaration, both sides.

/** Public handle: lower case, 2..39 chars, starts alphanumeric. */
export const HANDLE = /^[a-z0-9][a-z0-9-]{1,38}$/u;

/** Org slug or skill name, both validated on write. Slugs reach 67 chars (60 + id tail). */
export const SEGMENT = /^[a-z0-9][a-z0-9-]{0,79}$/u;

const URL_PREFIX =
  /^(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com|linkedin\.com\/in)\//iu;

/** Strips what people paste around a handle: a profile URL, a leading "@", a trailing "/". */
export function normalizeHandle(raw: string): string {
  return raw
    .trim()
    .replace(URL_PREFIX, "")
    .replace(/^@/u, "")
    .replace(/\/+$/u, "")
    .trim();
}
