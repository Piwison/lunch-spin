import type { MessageKey } from "@/i18n/dict";

type ErrorLike = { data?: { code?: string } | null } | null | undefined;

const KEYS: Record<string, MessageKey> = {
  BAD_REQUEST: "err.BAD_REQUEST",
  UNAUTHORIZED: "err.UNAUTHORIZED",
  FORBIDDEN: "err.FORBIDDEN",
  NOT_FOUND: "err.NOT_FOUND",
  CONFLICT: "err.CONFLICT",
  TOO_MANY_REQUESTS: "err.TOO_MANY_REQUESTS",
  PRECONDITION_FAILED: "err.PRECONDITION_FAILED",
  INTERNAL_SERVER_ERROR: "err.INTERNAL_SERVER_ERROR",
};

export function userError(
  error: ErrorLike,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
): string {
  return t(KEYS[error?.data?.code ?? ""] ?? "err.generic");
}
