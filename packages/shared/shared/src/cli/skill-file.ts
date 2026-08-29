// ponytail: an extension list, the NUL check after reading catches the rest.
const BINARY =
  /\.(png|jpe?g|gif|webp|svg|ico|pdf|zip|gz|tar|woff2?|ttf|otf|mp[34]|wav|bin|exe|dylib|so)$/i;
const SKIPPED = new Set(["node_modules", ".git"]);

/**
 * Whether a path inside a skill dir counts toward its content hash. The CLI
 * scan and the GitHub fetch both use it, so an adopted upstream skill hashes
 * the same on disk and in the directory. Dot files and dirs stay out on both
 * sides; binaries too.
 */
export function isSkillFile(path: string): boolean {
  const segments = path.split("/");
  return (
    !segments.some((s) => s.startsWith(".") || SKIPPED.has(s)) &&
    !BINARY.test(path)
  );
}
