import "server-only";

import type { PaginationMeta } from "@/types/api";

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 50;

export type PageRequest = {
  page: number;
  pageSize: number;
};

export type PageResult<T> = {
  items: T[];
  totalCount: number;
};

export function parsePageRequest(searchParams: URLSearchParams): PageRequest {
  return {
    page: positiveInteger(searchParams.get("page"), 1),
    pageSize: Math.min(
      positiveInteger(searchParams.get("per_page"), DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    ),
  };
}

export function pageOffset(request: PageRequest): number {
  return (request.page - 1) * request.pageSize;
}

export function paginationMeta(
  request: PageRequest,
  totalCount: number,
): PaginationMeta {
  return {
    page: request.page,
    perPage: request.pageSize,
    totalCount,
    totalPages: totalCount === 0 ? 0 : Math.ceil(totalCount / request.pageSize),
  };
}

function positiveInteger(value: string | null, fallback: number): number {
  if (!value || !/^\d+$/.test(value)) {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
