/** `err.*` — safe user-facing errors selected by tRPC error code. */
export const zh = {
  "err.BAD_REQUEST": "資料有誤，請檢查後再試。",
  "err.UNAUTHORIZED": "請先登入。",
  "err.FORBIDDEN": "你沒有權限執行這項操作。",
  "err.NOT_FOUND": "找不到指定內容，可能已被移除。",
  "err.CONFLICT": "資料已更新，請重新整理後再試。",
  "err.TOO_MANY_REQUESTS": "操作太頻繁，請稍後再試。",
  "err.PRECONDITION_FAILED": "目前無法完成這項操作。",
  "err.INTERNAL_SERVER_ERROR": "系統暫時發生問題，請稍後再試。",
  "err.generic": "操作失敗，請稍後再試。",
} as const satisfies Record<`err.${string}`, string>;

export const en: Record<keyof typeof zh, string> = {
  "err.BAD_REQUEST": "Something in that request wasn't valid. Check it and try again.",
  "err.UNAUTHORIZED": "Please sign in first.",
  "err.FORBIDDEN": "You don't have permission to do that.",
  "err.NOT_FOUND": "That item couldn't be found. It may have been removed.",
  "err.CONFLICT": "The data has changed. Refresh and try again.",
  "err.TOO_MANY_REQUESTS": "Too many attempts. Try again in a moment.",
  "err.PRECONDITION_FAILED": "That action isn't available right now.",
  "err.INTERNAL_SERVER_ERROR": "Something went wrong on our side. Try again later.",
  "err.generic": "That didn't work. Try again later.",
};
