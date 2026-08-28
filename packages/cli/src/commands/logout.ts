import { Result } from "@hubskillz/shared";
import { configPath, deleteConfig } from "../config";
import { dim } from "../output";

/** Forgets the device token and the registered projects. */
export async function logout(): Promise<Result<void>> {
  const removed = await deleteConfig();
  process.stdout.write(
    removed
      ? `Signed out. ${dim(`Removed ${configPath()}`)}\n`
      : `${dim("Not signed in.")}\n`,
  );
  return Result.ok(undefined);
}
