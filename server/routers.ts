import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { parseRestaurantList } from "@shared/import";
import { pickWinner } from "@shared/pick";
import { computeWeights, pickWeighted, type Weighted } from "@shared/weight";
import { applyVoteWeights, vetoedIds, voteCounts } from "@shared/session";
import {
  clearSession,
  clearVotes,
  emitSpin,
  getPresence,
  getSession,
  joinPresence,
  leavePresence,
  presenceIterator,
  sessionIterator,
  spinIterator,
  toggleVeto,
  toggleVote,
} from "./realtime";
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
  getUserById,
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
        const owner = await getUserById(wheel.ownerId);
        return { ...wheel, members, owner };
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(128),
        isShared: z.boolean(),
        isPublic: z.boolean(),
        exclusionDays: z.number().int().min(0).max(30).default(3),
        fairnessMode: z.boolean().default(false),
      }))
      .mutation(async ({ ctx, input }) => {
        const inviteToken = input.isShared ? nanoid(16) : undefined;
        const id = await createWheel(ctx.user.id, input.name, input.isShared, input.isPublic, inviteToken, input.exclusionDays, input.fairnessMode);
        return { id, inviteToken };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(128).optional(),
        isPublic: z.boolean().optional(),
        exclusionDays: z.number().int().min(0).max(30).optional(),
        fairnessMode: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const wheel = await getWheelById(input.id);
        if (!wheel) throw new TRPCError({ code: "NOT_FOUND" });
        if (wheel.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        await updateWheel(input.id, { name: input.name, isPublic: input.isPublic, exclusionDays: input.exclusionDays, fairnessMode: input.fairnessMode });
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
    // Server-authoritative spin: the server picks the winner among the eligible
    // restaurants and records it, so a shared wheel can't be tampered with from
    // the client. The candidate ids are the restaurants currently on the
    // caller's wheel (after their tag filter); the server re-validates them
    // against the wheel and the live exclusion window before choosing.
    create: protectedProcedure
      .input(z.object({ wheelId: z.number(), candidateIds: z.array(z.number()).min(1) }))
      .mutation(async ({ ctx, input }) => {
        const wheel = await getWheelById(input.wheelId);
        if (!wheel) throw new TRPCError({ code: "NOT_FOUND" });
        const isMember = await isWheelMember(input.wheelId, ctx.user.id);
        if (!isMember) throw new TRPCError({ code: "FORBIDDEN" });

        const rests = await getRestaurantsByWheel(input.wheelId);
        const valid = new Set(rests.map((r) => r.id));
        const exclusions = await getExclusions(input.wheelId, wheel.exclusionDays);
        // Server reads the live session itself (anti-tamper): vetoed restaurants
        // are out, votes bias the weighting.
        const session = getSession(input.wheelId);
        const vetoed = new Set(vetoedIds(session));
        const eligible = input.candidateIds.filter(
          (id) => valid.has(id) && !exclusions.has(id) && !vetoed.has(id),
        );
        if (eligible.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No eligible restaurants to spin" });
        }

        // Base weights: fairness mode favours neglected spots, else uniform.
        // Votes then bias the spin on top. A plain wheel stays a uniform pick.
        const votes = voteCounts(session);
        const hasVotes = votes.size > 0;
        let restaurantId: number;
        if (wheel.fairnessMode || hasVotes) {
          let base: Weighted[];
          if (wheel.fairnessMode) {
            const stats = await getRestaurantStats(input.wheelId);
            const lastPicked = new Map(stats.map((s) => [s.id, s.lastPickedAt]));
            base = computeWeights(eligible.map((id) => ({ restaurantId: id, lastPickedAt: lastPicked.get(id) ?? null })));
          } else {
            base = eligible.map((id) => ({ restaurantId: id, weight: 1 }));
          }
          restaurantId = pickWeighted(applyVoteWeights(base, votes));
        } else {
          restaurantId = pickWinner(eligible);
        }
        const id = await recordSpin(input.wheelId, restaurantId, ctx.user.id);
        const restaurant = rests.find((r) => r.id === restaurantId);
        // Broadcast to everyone watching this shared wheel.
        emitSpin(input.wheelId, {
          id,
          restaurantId,
          restaurantName: restaurant?.name ?? "",
          spunBy: ctx.user.id,
          spunByName: ctx.user.name,
        });
        // Votes belong to the round that just resolved — clear for the next one.
        clearVotes(input.wheelId);
        return { id, restaurantId };
      }),

    // Live spin broadcasts for an open shared wheel (SSE subscription).
    onSpin: protectedProcedure
      .input(z.object({ wheelId: z.number() }))
      .subscription(async function* ({ ctx, input, signal }) {
        const isMember = await isWheelMember(input.wheelId, ctx.user.id);
        if (!isMember) throw new TRPCError({ code: "FORBIDDEN" });
        yield* spinIterator(input.wheelId, signal!);
      }),

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

  // ─── Presence ────────────────────────────────────────────────────────────────

  presence: router({
    // "Who's here right now" for a shared wheel. Joining/leaving is driven by the
    // lifetime of this SSE subscription; the server ref-counts connections so a
    // user with multiple tabs shows once and disappears only when all close.
    onPresence: protectedProcedure
      .input(z.object({ wheelId: z.number() }))
      .subscription(async function* ({ ctx, input, signal }) {
        const isMember = await isWheelMember(input.wheelId, ctx.user.id);
        if (!isMember) throw new TRPCError({ code: "FORBIDDEN" });
        joinPresence(input.wheelId, ctx.user.id, ctx.user.name);
        try {
          yield getPresence(input.wheelId);
          for await (const _ of presenceIterator(input.wheelId, signal!)) {
            yield getPresence(input.wheelId);
          }
        } finally {
          leavePresence(input.wheelId, ctx.user.id);
        }
      }),
  }),

  // ─── Session (vetoes & votes) ─────────────────────────────────────────────────

  session: router({
    // Live veto/vote state for the current round on a shared wheel.
    onSession: protectedProcedure
      .input(z.object({ wheelId: z.number() }))
      .subscription(async function* ({ ctx, input, signal }) {
        const isMember = await isWheelMember(input.wheelId, ctx.user.id);
        if (!isMember) throw new TRPCError({ code: "FORBIDDEN" });
        yield getSession(input.wheelId);
        for await (const _ of sessionIterator(input.wheelId, signal!)) {
          yield getSession(input.wheelId);
        }
      }),

    veto: protectedProcedure
      .input(z.object({ wheelId: z.number(), restaurantId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const isMember = await isWheelMember(input.wheelId, ctx.user.id);
        if (!isMember) throw new TRPCError({ code: "FORBIDDEN" });
        toggleVeto(input.wheelId, input.restaurantId, ctx.user.id);
        return { success: true };
      }),

    vote: protectedProcedure
      .input(z.object({ wheelId: z.number(), restaurantId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const isMember = await isWheelMember(input.wheelId, ctx.user.id);
        if (!isMember) throw new TRPCError({ code: "FORBIDDEN" });
        toggleVote(input.wheelId, input.restaurantId, ctx.user.id);
        return { success: true };
      }),

    clear: protectedProcedure
      .input(z.object({ wheelId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const isMember = await isWheelMember(input.wheelId, ctx.user.id);
        if (!isMember) throw new TRPCError({ code: "FORBIDDEN" });
        clearSession(input.wheelId);
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
