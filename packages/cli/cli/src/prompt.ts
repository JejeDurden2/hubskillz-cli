import { createInterface } from "node:readline/promises";

const ENTER = new Set(["\r", "\n"]);
const BACKSPACE = new Set(["\u0008", "\u007F"]);
const CTRL_C = "\u0003";

/** Reads a secret. Echoes nothing on a TTY, reads one line from a pipe. */
export async function promptSecret(label: string): Promise<string> {
  const input = process.stdin;
  if (input.isTTY !== true) {
    return (await readAll(input)).split("\n")[0]?.trim() ?? "";
  }

  process.stdout.write(label);
  input.setRawMode(true);
  input.resume();
  input.setEncoding("utf8");

  return new Promise<string>((settle, fail) => {
    let value = "";
    const cleanup = (): void => {
      input.setRawMode(false);
      input.pause();
      input.off("data", onData);
      process.stdout.write("\n");
    };
    const onData = (chunk: string): void => {
      for (const char of chunk) {
        if (ENTER.has(char)) {
          cleanup();
          settle(value.trim());
          return;
        }
        if (char === CTRL_C) {
          cleanup();
          fail(new Error("Interrupted"));
          return;
        }
        value = BACKSPACE.has(char) ? value.slice(0, -1) : value + char;
      }
    };
    input.on("data", onData);
  });
}

export async function confirm(question: string): Promise<boolean> {
  if (process.stdin.isTTY !== true) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return answer.trim().toLowerCase() === "y";
  } finally {
    rl.close();
  }
}

async function readAll(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * "1, 3" -> [0, 2]. Empty, "all" or "a" selects everything; "none" or "n"
 * nothing. Out-of-range and non-numeric tokens are dropped.
 */
export function parseSelection(answer: string, count: number): number[] {
  const text = answer.trim().toLowerCase();
  if (text === "" || text === "all" || text === "a") {
    return Array.from({ length: count }, (_, index) => index);
  }
  if (text === "none" || text === "n") return [];
  const picked = new Set<number>();
  for (const token of text.split(/[\s,]+/u)) {
    const index = Number(token) - 1;
    if (Number.isInteger(index) && index >= 0 && index < count) {
      picked.add(index);
    }
  }
  return [...picked].sort((left, right) => left - right);
}

/** Numbered list, answered by numbers. Every choice when stdin is not a TTY. */
export async function selectMany(
  question: string,
  choices: readonly string[],
): Promise<readonly string[]> {
  if (process.stdin.isTTY !== true) return choices;
  process.stdout.write(`${question}\n`);
  choices.forEach((choice, index) => {
    process.stdout.write(`  ${index + 1}. ${choice}\n`);
  });
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question("Select [all]: ");
    const picked = new Set(parseSelection(answer, choices.length));
    return choices.filter((_, index) => picked.has(index));
  } finally {
    rl.close();
  }
}
