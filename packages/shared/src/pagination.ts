import { z } from "zod";

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export function paginate<T>(
  items: T[],
  total: number,
  query: PaginationQuery,
): Page<T> {
  return { items, total, page: query.page, pageSize: query.pageSize };
}
