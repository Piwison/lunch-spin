import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";
import { deleteUserAccount } from "./db";

// The router's own behaviour is what's under test, not the SQL — this file has
// no database. Everything else in ./db stays real so the import graph is
// unchanged (getDb only connects when a query actually runs).
vi.mock("./db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./db")>()),
  deleteUserAccount: vi.fn(async () => ({ wheelsDeleted: 2 })),
}));

type CookieCall = { name: string; options: Record<string, unknown> };

function createContext(authenticated: boolean) {
  const clearedCookies: CookieCall[] = [];
  const ctx: TrpcContext = {
    user: authenticated
      ? {
          id: 7,
          openId: "sample-user",
          email: "sample@example.com",
          name: "Sample User",
          loginMethod: "manus",
          role: "user",
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        }
      : null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };
  return { ctx, clearedCookies };
}

describe("auth.deleteAccount", () => {
  it("deletes only the caller's own account", async () => {
    const { ctx } = createContext(true);
    await appRouter.createCaller(ctx).auth.deleteAccount();
    // The id comes from the session, never from client input — there is no
    // input schema here at all, so no request can name someone else's account.
    expect(deleteUserAccount).toHaveBeenCalledWith(7);
  });

  it("clears the session cookie in the same response", async () => {
    // The users row is gone the moment this returns. A surviving cookie would
    // leave a browser that looks signed in but resolves to nobody on every
    // request, so the session has to die with the account — same options as
    // logout, or the clear silently misses the cookie it is trying to remove.
    const { ctx, clearedCookies } = createContext(true);
    const result = await appRouter.createCaller(ctx).auth.deleteAccount();

    expect(result).toMatchObject({ success: true, wheelsDeleted: 2 });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({
      maxAge: -1,
      secure: true,
      sameSite: "none",
      httpOnly: true,
      path: "/",
    });
  });

  it("rejects an anonymous caller without touching any data", async () => {
    vi.mocked(deleteUserAccount).mockClear();
    const { ctx, clearedCookies } = createContext(false);

    await expect(appRouter.createCaller(ctx).auth.deleteAccount()).rejects.toThrow();
    expect(deleteUserAccount).not.toHaveBeenCalled();
    expect(clearedCookies).toHaveLength(0);
  });
});
