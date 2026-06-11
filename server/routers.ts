import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { parseRestaurantList } from "@shared/import";
import {
  addRestaurant,
  addRestaurants,
  addWheelMember,
  createCustomTag,
  createWheel,
  deleteRestaurant,
  deleteWheel,
  getExclusions,
  getRestaurantById,
  getRestaurantsByWheel,
  getRestaurantStats,
  getSpinHistory,
  getTagsForWheel,
  getUserWheels,
  getWheelById,
  getWheelByInviteToken,
  getWheelMembers,
  isWheelMember,
  recordSpin,
  reenableRestaurant,
  updateRestaurant,
  updateWheel,
} from "./db";

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Wheels ─────────────────────────────────────────────────────────────────

  wheels: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return getUserWheels(ctx.user.id);
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const wheel = await getWheelById(input.id);
        if (!wheel) throw new TRPCError({ code: "NOT_FOUND" });
        const isMember = await isWheelMember(input.id, ctx.user.id);
        if (!isMember && !wheel.isPublic) throw new TRPCError({ code: "FORBIDDEN" });
        const members = await getWheelMembers(input.id);
        return { ...wheel, members };
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(128),
        isShared: z.boolean(),
        isPublic: z.boolean(),
        exclusionDays: z.number().int().min(0).max(30).default(3),
      }))
      .mutation(async ({ ctx, input }) => {
        const inviteToken = input.isShared ? nanoid(16) : undefined;
        const id = await createWheel(ctx.user.id, input.name, input.isShared, input.isPublic, inviteToken, input.exclusionDays);
        return { id, inviteToken };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(128).optional(),
        isPublic: z.boolean().optional(),
        exclusionDays: z.number().int().min(0).max(30).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const wheel = await getWheelById(input.id);
        if (!wheel) throw new TRPCError({ code: "NOT_FOUND" });
        if (wheel.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        await updateWheel(input.id, { name: input.name, isPublic: input.isPublic, exclusionDays: input.exclusionDays });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const wheel = await getWheelById(input.id);
        if (!wheel) throw new TRPCError({ code: "NOT_FOUND" });
        if (wheel.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        await deleteWheel(input.id);
        return { success: true };
      }),

    regenerateInvite: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const wheel = await getWheelById(input.id);
        if (!wheel) throw new TRPCError({ code: "NOT_FOUND" });
        if (wheel.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        const inviteToken = nanoid(16);
        await updateWheel(input.id, { inviteToken });
        return { inviteToken };
      }),

    join: protectedProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const wheel = await getWheelByInviteToken(input.token);
        if (!wheel) throw new TRPCError({ code: "NOT_FOUND", message: "Invalid invite link" });
        if (!wheel.isShared) throw new TRPCError({ code: "FORBIDDEN", message: "This wheel is not shared" });
        await addWheelMember(wheel.id, ctx.user.id);
        return { wheelId: wheel.id, wheelName: wheel.name };
      }),
  }),

  // ─── Tags ────────────────────────────────────────────────────────────────────

  tags: router({
    list: protectedProcedure
      .input(z.object({ wheelId: z.number() }))
      .query(async ({ ctx, input }) => {
        const wheel = await getWheelById(input.wheelId);
        if (!wheel) throw new TRPCError({ code: "NOT_FOUND" });
        const isMember = await isWheelMember(input.wheelId, ctx.user.id);
        if (!isMember && !wheel.isPublic) throw new TRPCError({ code: "FORBIDDEN" });
        return getTagsForWheel(input.wheelId);
      }),

    createCustom: protectedProcedure
      .input(z.object({ name: z.string().min(1).max(64), wheelId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const isMember = await isWheelMember(input.wheelId, ctx.user.id);
        if (!isMember) throw new TRPCError({ code: "FORBIDDEN" });
        const id = await createCustomTag(input.name, ctx.user.id, input.wheelId);
        return { id };
      }),
  }),

  // ─── Restaurants ─────────────────────────────────────────────────────────────

  restaurants: router({
    list: protectedProcedure
      .input(z.object({ wheelId: z.number() }))
      .query(async ({ ctx, input }) => {
        const wheel = await getWheelById(input.wheelId);
        if (!wheel) throw new TRPCError({ code: "NOT_FOUND" });
        const isMember = await isWheelMember(input.wheelId, ctx.user.id);
        if (!isMember && !wheel.isPublic) throw new TRPCError({ code: "FORBIDDEN" });
        const rests = await getRestaurantsByWheel(input.wheelId);
        const exclusions = await getExclusions(input.wheelId, wheel.exclusionDays);
        return rests.map((r) => ({
          ...r,
          isExcluded: exclusions.has(r.id),
          excludedUntil: exclusions.get(r.id) ?? null,
        }));
      }),

    add: protectedProcedure
      .input(z.object({ wheelId: z.number(), name: z.string().min(1).max(128), notes: z.string().max(500).nullable(), tagIds: z.array(z.number()) }))
      .mutation(async ({ ctx, input }) => {
        const wheel = await getWheelById(input.wheelId);
        if (!wheel) throw new TRPCError({ code: "NOT_FOUND" });
        const isMember = await isWheelMember(input.wheelId, ctx.user.id);
        if (!isMember) throw new TRPCError({ code: "FORBIDDEN" });
        const id = await addRestaurant(input.wheelId, ctx.user.id, input.name, input.notes, input.tagIds);
        return { id };
      }),

    addBulk: protectedProcedure
      .input(z.object({ wheelId: z.number(), text: z.string().max(10000) }))
      .mutation(async ({ ctx, input }) => {
        const wheel = await getWheelById(input.wheelId);
        if (!wheel) throw new TRPCError({ code: "NOT_FOUND" });
        const isMember = await isWheelMember(input.wheelId, ctx.user.id);
        if (!isMember) throw new TRPCError({ code: "FORBIDDEN" });
        const existing = await getRestaurantsByWheel(input.wheelId);
        const { names, skipped } = parseRestaurantList(input.text, existing.map((r) => r.name));
        const added = await addRestaurants(input.wheelId, ctx.user.id, names);
        return { added, skipped };
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number(), name: z.string().min(1).max(128), notes: z.string().max(500).nullable(), tagIds: z.array(z.number()) }))
      .mutation(async ({ ctx, input }) => {
        const restaurant = await getRestaurantById(input.id);
        if (!restaurant) throw new TRPCError({ code: "NOT_FOUND" });
        const wheel = await getWheelById(restaurant.wheelId);
        if (!wheel) throw new TRPCError({ code: "NOT_FOUND" });
        if (wheel.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Only the wheel creator can edit restaurants" });
        await updateRestaurant(input.id, input.name, input.notes, input.tagIds);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const restaurant = await getRestaurantById(input.id);
        if (!restaurant) throw new TRPCError({ code: "NOT_FOUND" });
        const wheel = await getWheelById(restaurant.wheelId);
        if (!wheel) throw new TRPCError({ code: "NOT_FOUND" });
        if (wheel.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Only the wheel creator can delete restaurants" });
        await deleteRestaurant(input.id);
        return { success: true };
      }),
  }),

  // ─── Spins ───────────────────────────────────────────────────────────────────

  spins: router({
    record: protectedProcedure
      .input(z.object({ wheelId: z.number(), restaurantId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const isMember = await isWheelMember(input.wheelId, ctx.user.id);
        if (!isMember) throw new TRPCError({ code: "FORBIDDEN" });
        const id = await recordSpin(input.wheelId, input.restaurantId, ctx.user.id);
        return { id };
      }),

    history: protectedProcedure
      .input(z.object({ wheelId: z.number() }))
      .query(async ({ ctx, input }) => {
        const isMember = await isWheelMember(input.wheelId, ctx.user.id);
        if (!isMember) throw new TRPCError({ code: "FORBIDDEN" });
        return getSpinHistory(input.wheelId);
      }),

    reenable: protectedProcedure
      .input(z.object({ wheelId: z.number(), restaurantId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const wheel = await getWheelById(input.wheelId);
        if (!wheel) throw new TRPCError({ code: "NOT_FOUND" });
        const isMember = await isWheelMember(input.wheelId, ctx.user.id);
        if (!isMember) throw new TRPCError({ code: "FORBIDDEN" });
        await reenableRestaurant(input.wheelId, input.restaurantId, wheel.exclusionDays);
        return { success: true };
      }),
  }),

  // ─── Statistics ─────────────────────────────────────────────────────────────

  stats: router({
    getRestaurantStats: protectedProcedure
      .input(z.object({ wheelId: z.number() }))
      .query(async ({ ctx, input }) => {
        const isMember = await isWheelMember(input.wheelId, ctx.user.id);
        if (!isMember) throw new TRPCError({ code: "FORBIDDEN" });
        return getRestaurantStats(input.wheelId);
      }),
  }),
});

export type AppRouter = typeof appRouter;
