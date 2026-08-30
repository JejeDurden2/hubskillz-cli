// CLI <-> api contract
export { contentHash } from "./cli/content-hash";
export { computeState, withInheritance } from "./cli/compute-state";
export type { SkillVersionRef } from "./cli/compute-state";
export { isSkillFile } from "./cli/skill-file";
export * from "./cli/schemas";

// Web <-> api wire contract
export * from "./web/read-models";

// Errors
export { DomainError } from "./errors/domain-error";

// Result
export { Result } from "./result/result";

// Pagination
export {
  paginate,
  paginationQuerySchema,
  type Page,
  type PaginationQuery,
} from "./pagination";

// Directory business rules shared by web and api
export * from "./directory/segments";
export * from "./directory/skill-state";
export * from "./directory/upstream";
export * from "./directory/skill-errors";
export * from "./directory/skill-md";
