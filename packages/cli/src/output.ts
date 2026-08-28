const CSI = "\u001B[";
const ANSI_PATTERN = new RegExp(`${CSI.replace("[", "\\[")}[0-9;]*m`, "gu");

function colorEnabled(): boolean {
  return process.env["NO_COLOR"] === undefined && process.stdout.isTTY === true;
}

function wrap(code: string, text: string): string {
  return colorEnabled() ? `${CSI}${code}m${text}${CSI}0m` : text;
}

export function bold(text: string): string {
  return wrap("1", text);
}

export function dim(text: string): string {
  return wrap("2", text);
}

export function accent(text: string): string {
  return wrap("33", text);
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

export function shortHash(hash: string | undefined): string {
  return hash === undefined ? "-" : hash.slice(0, 8);
}
