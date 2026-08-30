import { styleText } from "node:util";

// styleText already honours NO_COLOR, FORCE_COLOR and TTY detection.
// The escape character is what this pattern exists to match.
// oxlint-disable-next-line no-control-regex
const ANSI_PATTERN = /\u001B\[[0-9;]*m/gu;

export function bold(text: string): string {
  return styleText("bold", text);
}

export function dim(text: string): string {
  return styleText("dim", text);
}

export function accent(text: string): string {
  return styleText("yellow", text);
}

/** "1 skill", "3 skills". */
export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Plain aligned columns. Widths ignore ANSI, so coloured cells stay aligned. */
export function table(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const widths = headers.map((header, index) =>
    Math.max(
      visibleLength(header),
      ...rows.map((row) => visibleLength(row[index] ?? "")),
    ),
  );
  const line = (cells: readonly string[]): string =>
    cells
      .map((cell, index) =>
        index === cells.length - 1
          ? cell
          : cell + " ".repeat((widths[index] ?? 0) - visibleLength(cell)),
      )
      .join("  ")
      .trimEnd();

  return [line(headers.map(bold)), ...rows.map(line)].join("\n");
}

function visibleLength(text: string): number {
  return text.replace(ANSI_PATTERN, "").length;
}
