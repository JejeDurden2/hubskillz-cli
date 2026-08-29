// CLI <-> web contract
export * from "./cli/index";

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
