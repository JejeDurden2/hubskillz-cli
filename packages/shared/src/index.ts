// CLI <-> api contract
export * from "./cli/index";

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
export * from "./directory/index";
