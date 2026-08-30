import { z } from "zod";

// Shared leaves ------------------------------------------------------------

export const skillStateSchema = z.enum([
  "synced",
  "drifted",
  "customized",
  "missing",
  // Absent from a project surface but installed in the machine's global root:
  // Claude Code loads ~/.claude/skills in every project, so nothing is missing
  // and nothing must be written. The global surface carries the real state.
  "inherited",
  "unmanaged",
]);
export type SkillState = z.infer<typeof skillStateSchema>;

export const surfaceKindSchema = z.literal("claude-code-local");
export type SurfaceKind = z.infer<typeof surfaceKindSchema>;

/** Directory skill name: kebab-case, what a skill dir on disk is called. */
export const skillNameSchema = z
  .string()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

/** POSIX path relative to the skill dir. No absolute, no `..`, no backslash, no NUL. */
export const skillFilePathSchema = z
  .string()
  .min(1)
  .max(200)
  .refine(
    (path) =>
      !path.startsWith("/") &&
      !path.includes("\\") &&
      !path.includes("\0") &&
      !path.split("/").includes(".."),
    "path must be relative, without .. segments, backslashes or NUL",
  );

export const MAX_FILES_PER_SKILL = 100;
export const MAX_FILE_CONTENT_CHARS = 200_000;
export const MAX_SKILLS_PER_REQUEST = 500;
/** Whole-skill budget for the inventory snapshot of a private skill. */
export const MAX_SNAPSHOT_CHARS = MAX_FILE_CONTENT_CHARS;
/** Serialized bytes per inventory chunk, under the API body limit (2 MiB). */
export const MAX_INVENTORY_CHUNK_BYTES = 1_500_000;

/**
 * File as sent in an inventory: the hash always travels, the content only for
 * private skills (no upstream), so the web app can add them to the directory.
 */
export const inventoryFileSchema = z.object({
  path: skillFilePathSchema,
  hash: z.string().min(1),
  size: z.number().int().nonnegative(),
  content: z.string().max(MAX_FILE_CONTENT_CHARS).optional(),
});
export type InventoryFile = z.infer<typeof inventoryFileSchema>;

/** File as sent in a draft or returned by /approved: full content. */
export const skillFileSchema = z.object({
  path: skillFilePathSchema,
  content: z.string().max(MAX_FILE_CONTENT_CHARS),
});
export type SkillFile = z.infer<typeof skillFileSchema>;

/** What the CLI read from the skills.sh lock file next to the surface. */
export const inventoryUpstreamSchema = z.object({
  source: z.string().min(1).max(200),
  skillPath: z.string().min(1).max(500),
  hash: z.string().min(1).max(128),
});
export type InventoryUpstream = z.infer<typeof inventoryUpstreamSchema>;

// GET /api/cli/me ----------------------------------------------------------

export const meResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
  }),
  org: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
  }),
  surfaces: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      label: z.string(),
    }),
  ),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

// POST /api/cli/inventory --------------------------------------------------

export const surfaceDescriptorSchema = z.object({
  kind: surfaceKindSchema,
  label: z.string().min(1).max(200),
  machineId: z.string().min(1).max(200),
  path: z.string().min(1).max(1000),
  /** The global root (~/.claude/skills) or a project. Absent on old CLIs. */
  scope: z.enum(["global", "project"]).optional(),
});
export type SurfaceDescriptor = z.infer<typeof surfaceDescriptorSchema>;

export const inventoryRequestSchema = z.object({
  surface: surfaceDescriptorSchema,
  skills: z
    .array(
      z.object({
        // Lenient on purpose: whatever sits on disk gets reported.
        name: z.string().min(1).max(100),
        contentHash: z.string().min(1).max(128),
        files: z.array(inventoryFileSchema).max(MAX_FILES_PER_SKILL),
        upstream: inventoryUpstreamSchema.optional(),
      }),
    )
    .max(MAX_SKILLS_PER_REQUEST),
  /** Big surfaces travel in chunks: chunk 0 replaces, the others append. */
  chunk: z
    .object({
      index: z.number().int().min(0),
      total: z.number().int().min(1),
    })
    .optional(),
});
export type InventoryRequest = z.infer<typeof inventoryRequestSchema>;

export const inventoryItemSchema = z.object({
  name: z.string(),
  state: skillStateSchema,
  installedHash: z.string().optional(),
  approvedVersionId: z.string().optional(),
  approvedVersion: z.number().int().optional(),
  required: z.boolean(),
  /** unmanaged and installed from skills.sh: one click adds it to the directory. */
  importable: z.boolean(),
  /** Directory skill whose upstream head is newer than the approved pin. */
  upstreamAhead: z.boolean().optional(),
});
export type InventoryItem = z.infer<typeof inventoryItemSchema>;

export const inventoryResponseSchema = z.object({
  surfaceId: z.string(),
  items: z.array(inventoryItemSchema),
});
export type InventoryResponse = z.infer<typeof inventoryResponseSchema>;

// GET /api/cli/approved ----------------------------------------------------

export const approvedQuerySchema = z.object({ surfaceId: z.string().min(1) });
export type ApprovedQuery = z.infer<typeof approvedQuerySchema>;

export const approvedSkillSchema = z.object({
  // Kebab, not z.string(): the CLI joins this onto a path (commands/sync.ts),
  // so the response is validated rather than trusted.
  name: skillNameSchema,
  versionId: z.string(),
  version: z.number().int(),
  contentHash: z.string(),
  /** Org audit policy blocks this version: files is empty and the CLI prints why. */
  blocked: z.boolean(),
  blockedReason: z.string().optional(),
  files: z.array(skillFileSchema),
});
export type ApprovedSkill = z.infer<typeof approvedSkillSchema>;

export const approvedResponseSchema = z.object({
  skills: z.array(approvedSkillSchema),
});
export type ApprovedResponse = z.infer<typeof approvedResponseSchema>;

// POST /api/cli/adopt ------------------------------------------------------

export const adoptRequestSchema = z.object({ surfaceId: z.string().min(1) });
export type AdoptRequest = z.infer<typeof adoptRequestSchema>;

/** Every importable skill of the surface became an approved directory skill. */
export const adoptResponseSchema = z.object({
  adopted: z.array(z.string()),
  skipped: z.array(z.object({ name: z.string(), code: z.string() })),
});
export type AdoptResponse = z.infer<typeof adoptResponseSchema>;

// POST /api/cli/drafts -----------------------------------------------------

export const draftRequestSchema = z.object({
  name: skillNameSchema,
  files: z.array(skillFileSchema).min(1).max(MAX_FILES_PER_SKILL),
  message: z.string().max(500).optional(),
});
export type DraftRequest = z.infer<typeof draftRequestSchema>;

export const draftResponseSchema = z.object({
  skillId: z.string(),
  versionId: z.string(),
});
export type DraftResponse = z.infer<typeof draftResponseSchema>;

// GET /api/cli/pending -----------------------------------------------------

export const pendingQuerySchema = z.object({ surfaceId: z.string().min(1) });
export type PendingQuery = z.infer<typeof pendingQuerySchema>;

export const pendingResponseSchema = z.object({
  requests: z.array(
    z.object({
      id: z.string(),
      skillName: z.string().nullable(),
    }),
  ),
});
export type PendingResponse = z.infer<typeof pendingResponseSchema>;

// POST /api/cli/pending/:id/applied ----------------------------------------

export const appliedResponseSchema = z.object({ ok: z.literal(true) });
export type AppliedResponse = z.infer<typeof appliedResponseSchema>;

// Error body every /api/cli/* route returns on failure ---------------------

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
