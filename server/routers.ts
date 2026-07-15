import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { applyMoodBoost, explainPick, moodBoost, moodKeywords, type SmartCandidate } from "@shared/smartPick";
import { resolveAddList } from "@shared/parseAddList";
import { parseRestaurantList } from "@shared/import";
import { serializeWheel, wheelExportSchema } from "@shared/transfer";
import { toPublicRestaurant, toPublicWheel } from "@shared/publicWheel";
import { pickWinner } from "@shared/pick";
import { applyCuisineRotation, computeWeights, pickWeighted, type Weighted } from "@shared/weight";
import { applyVoteWeights, excludedDietaryTagIds, vetoedIds, voteCounts } from "@shared/session";
import { applyRatingWeights, RATINGS } from "@shared/rating";
import { activePresence, buildSessionState } from "@shared/realtimeState";
import { DEFAULT_RADIUS_M, rankNearby } from "@shared/nearby";
import { mapProviderResults } from "@shared/placeMapping";
import { matchCuisineTag } from "@shared/cuisineTag";
import { mergeWalkTimes, routableCoords } from "@shared/walkTime";
import { isPlacesConfigured, resolvePlaceLink, searchNearbyRestaurants, walkingMatrix } from "./places";
import {
  clearRoundAll,
  clearRoundVotes,
  getActivePresence,
  getLatestSpin,
  getRoundMarks,
  pingPresence,
  toggleRoundMark,
} from "./db";
import {
  addRestaurant,
  addRestaurants,
  addWheelMember,
  createCustomTag,
  createWheel,
  deleteRestaurant,
  deleteWheel,
  getExclusions,
  getPopularPublicWheels,
  getRestaurantById,
  getRestaurantsByWheel,
  getLatestRatings,
  getRestaurantStats,
  getSpinHistory,
  rateSpin,
  getTagsForWheel,
  getUserById,
  getWheelPlaceIds,
  importWheelData,
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

// A presence heartbeat counts as "online" for this long after the last ping.
// Kept ≥ 2.5× the client's ~10s ping interval so one dropped beat doesn't flicker.
const PRESENCE_TTL_MS = 25_000;

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

    // ── Guest (no sign-in) reads ──────────────────────────────────────────────
    // Public-safe wheel for the /w/:id guest view. Only public wheels resolve;
    // anything else is NOT_FOUND (a once-public wheel that went private reads the
    // same — the client shows a graceful "not available" state). Output is shaped
    // through `toPublicWheel` so no owner/member PII can leak.
    getPublic: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const wheel = await getWheelById(input.id);
        if (!wheel || !wheel.isPublic) throw new TRPCError({ code: "NOT_FOUND" });
        return toPublicWheel(wheel);
      }),

    // Popular public wheels for the landing "try without signing in" section,
    // ranked by spin count. No PII; just id/name/counts.
    listPublic: publicProcedure
      .input(z.object({ limit: z.number().int().min(1).max(24).default(8) }))
      .query(async ({ input }) => getPopularPublicWheels(input.limit)),

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
        rotateCuisines: z.boolean().default(false),
      }))
      .mutation(async ({ ctx, input }) => {
        const inviteToken = input.isShared ? nanoid(16) : undefined;
        const id = await createWheel(ctx.user.id, input.name, input.isShared, input.isPublic, inviteToken, input.exclusionDays, input.fairnessMode, input.rotateCuisines);
        return { id, inviteToken };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(128).optional(),
        isPublic: z.boolean().optional(),
        exclusionDays: z.number().int().min(0).max(30).optional(),
        fairnessMode: z.boolean().optional(),
        rotateCuisines: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const wheel = await getWheelById(input.id);
        if (!wheel) throw new TRPCError({ code: "NOT_FOUND" });
        if (wheel.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        await updateWheel(input.id, { name: input.name, isPublic: input.isPublic, exclusionDays: input.exclusionDays, fairnessMode: input.fairnessMode, rotateCuisines: input.rotateCuisines });
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

    // Portable JSON bundle of a wheel + its restaurants (no ids).
    export: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const wheel = await getWheelById(input.id);
        if (!wheel) throw new TRPCError({ code: "NOT_FOUND" });
        const isMember = await isWheelMember(input.id, ctx.user.id);
        if (!isMember && !wheel.isPublic) throw new TRPCError({ code: "FORBIDDEN" });
        const rests = await getRestaurantsByWheel(input.id);
        return serializeWheel(wheel, rests);
      }),

    // Create a fresh wheel for the caller from an export bundle.
    import: protectedProcedure
      .input(wheelExportSchema)
      .mutation(async ({ ctx, input }) => {
        const id = await importWheelData(ctx.user.id, input);
        return { id };
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
      .input(z.object({
        name: z.string().min(1).max(64),
        wheelId: z.number(),
        category: z.enum(["cuisine", "food_type", "custom"]).default("custom"),
      }))
      .mutation(async ({ ctx, input }) => {
        const isMember = await isWheelMember(input.wheelId, ctx.user.id);
        if (!isMember) throw new TRPCError({ code: "FORBIDDEN" });
        const id = await createCustomTag(input.name, ctx.user.id, input.wheelId, input.category);
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

    // Guest read for the /w/:id view: the full restaurant list of a public wheel
    // (guests spin everything — no exclusion state). Public-safe fields only.
    listPublic: publicProcedure
      .input(z.object({ wheelId: z.number() }))
      .query(async ({ input }) => {
        const wheel = await getWheelById(input.wheelId);
        if (!wheel || !wheel.isPublic) throw new TRPCError({ code: "NOT_FOUND" });
        const rests = await getRestaurantsByWheel(input.wheelId);
        return rests.map(toPublicRestaurant);
      }),

    add: protectedProcedure
      .input(z.object({ wheelId: z.number(), name: z.string().min(1).max(128), notes: z.string().max(500).nullable(), tagIds: z.array(z.number()), mapUrl: z.string().max(512).nullable().optional() }))
      .mutation(async ({ ctx, input }) => {
        const wheel = await getWheelById(input.wheelId);
        if (!wheel) throw new TRPCError({ code: "NOT_FOUND" });
        const isMember = await isWheelMember(input.wheelId, ctx.user.id);
        if (!isMember) throw new TRPCError({ code: "FORBIDDEN" });
        const id = await addRestaurant(input.wheelId, ctx.user.id, input.name, input.notes, input.tagIds, input.mapUrl ?? null);
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
      .input(z.object({ id: z.number(), name: z.string().min(1).max(128), notes: z.string().max(500).nullable(), tagIds: z.array(z.number()), mapUrl: z.string().max(512).nullable().optional() }))
      .mutation(async ({ ctx, input }) => {
        const restaurant = await getRestaurantById(input.id);
        if (!restaurant) throw new TRPCError({ code: "NOT_FOUND" });
        const wheel = await getWheelById(restaurant.wheelId);
        if (!wheel) throw new TRPCError({ code: "NOT_FOUND" });
        if (wheel.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Only the wheel creator can edit restaurants" });
        await updateRestaurant(input.id, input.name, input.notes, input.tagIds, input.mapUrl ?? null);
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

  // ─── Places (located wheel) ───────────────────────────────────────────────────

  places: router({
    // Nearby restaurant search for the "located wheel". Given the caller's
    // coordinates, ask the place provider for nearby restaurants, map each row
    // to the domain shape (`shared/placeMapping`), and rank it (`shared/nearby`)
    // — chain de-dup, walk-time order, soft filters, low-density flag. Read-only:
    // it proposes places the client can add; nothing is written here, and the
    // server still owns the eventual spin. Modelled as a mutation because it is
    // an on-demand action driven by a location the client just captured.
    searchNearby: protectedProcedure
      .input(
        z.object({
          wheelId: z.number(),
          lat: z.number().min(-90).max(90),
          lng: z.number().min(-180).max(180),
          radius: z.number().int().min(100).max(5000).optional(),
          keyword: z.string().max(120).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const isMember = await isWheelMember(input.wheelId, ctx.user.id);
        if (!isMember) throw new TRPCError({ code: "FORBIDDEN" });
        if (!isPlacesConfigured()) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Nearby search isn't configured on this server.",
          });
        }

        const radius = input.radius ?? DEFAULT_RADIUS_M;
        let res: Awaited<ReturnType<typeof searchNearbyRestaurants>>;
        try {
          res = await searchNearbyRestaurants(input.lat, input.lng, radius, input.keyword);
        } catch {
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message: "Couldn't reach the place provider. Try again in a moment.",
          });
        }
        if (res.status && res.status !== "OK" && res.status !== "ZERO_RESULTS") {
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message: `Place provider error: ${res.status}`,
          });
        }

        const origin = { lat: input.lat, lng: input.lng };
        const mapped = mapProviderResults(res.results ?? [], origin);
        const ranked = rankNearby(mapped);

        // Refine the ranked segments (≤12 → one Distance Matrix request) with
        // real walking times; re-ranked nearest-first on merge. Strictly
        // optional — any failure (API disabled, quota, network) keeps the
        // haversine estimates and each place says which one it carries.
        let segments = mergeWalkTimes(ranked.segments, []);
        try {
          const elements = await walkingMatrix(origin, routableCoords(ranked.segments));
          segments = mergeWalkTimes(ranked.segments, elements);
        } catch {
          // estimates stand
        }

        const existing = await getWheelPlaceIds(input.wheelId);
        const places = segments.map((p) => ({
          placeId: p.placeId,
          name: p.name,
          walkMinutes: p.walkMinutes,
          walkSource: p.walkSource,
          distanceMeters: p.distanceMeters ?? null,
          cuisine: p.cuisine,
          priceLevel: p.priceLevel,
          open: p.open ?? null,
          lat: p.lat,
          lng: p.lng,
          address: p.address,
          alreadyAdded: existing.has(p.placeId),
        }));
        return {
          places,
          chainsGrouped: ranked.chainsGrouped,
          lowDensity: ranked.lowDensity,
          radius,
        };
      }),

    // Persist a chosen nearby place onto the wheel as a provider-sourced
    // restaurant. De-duplicated by placeId so the same physical spot can't be
    // added twice. Reuses `restaurants.add`'s ownership model (any member adds).
    addNearby: protectedProcedure
      .input(
        z.object({
          wheelId: z.number(),
          place: z.object({
            placeId: z.string().min(1).max(256),
            name: z.string().min(1).max(128),
            lat: z.number().min(-90).max(90).nullable(),
            lng: z.number().min(-180).max(180).nullable(),
            address: z.string().max(512).nullable(),
            priceLevel: z.number().int().min(1).max(4).nullable(),
            cuisine: z.string().max(64).nullable(),
            mapUrl: z.string().max(512).nullable().optional(),
          }),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const wheel = await getWheelById(input.wheelId);
        if (!wheel) throw new TRPCError({ code: "NOT_FOUND" });
        const isMember = await isWheelMember(input.wheelId, ctx.user.id);
        if (!isMember) throw new TRPCError({ code: "FORBIDDEN" });

        const existing = await getWheelPlaceIds(input.wheelId);
        if (existing.has(input.place.placeId)) {
          return { id: null, duplicate: true as const };
        }
        // Auto-link the provider cuisine to an EXISTING cuisine/food_type tag
        // (never invents one — the 0009 seed catalog carries the labels
        // placeMapping emits). The matched tag becomes the primary tag, so the
        // place gets its wheel-segment color and joins cuisine rotation.
        const wheelTags = await getTagsForWheel(input.wheelId);
        const cuisineTag = matchCuisineTag(input.place.cuisine, wheelTags);
        const id = await addRestaurant(
          input.wheelId,
          ctx.user.id,
          input.place.name,
          null,
          cuisineTag ? [cuisineTag.id] : [],
          input.place.mapUrl ?? null,
          {
            placeId: input.place.placeId,
            lat: input.place.lat,
            lng: input.place.lng,
            address: input.place.address,
            priceLevel: input.place.priceLevel,
            cuisine: input.place.cuisine,
          },
        );
        return { id, duplicate: false as const, taggedAs: cuisineTag?.name ?? null };
      }),

    // Resolve a pasted Google Maps link into a nameable place (Place Details /
    // Find Place, expanding short links). Read-only proposal — the client
    // prefills the add form and the user confirms; the write still goes through
    // restaurants.add. Member-gated; degrades like searchNearby when unconfigured.
    resolveLink: protectedProcedure
      .input(z.object({ wheelId: z.number(), url: z.string().min(1).max(2048) }))
      .mutation(async ({ ctx, input }) => {
        const isMember = await isWheelMember(input.wheelId, ctx.user.id);
        if (!isMember) throw new TRPCError({ code: "FORBIDDEN" });
        if (!isPlacesConfigured()) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Place lookup isn't configured on this server.",
          });
        }
        let place;
        try {
          place = await resolvePlaceLink(input.url);
        } catch {
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message: "Couldn't reach the place provider. Try again in a moment.",
          });
        }
        if (!place) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Couldn't find a place in that link. Paste a Google Maps place link.",
          });
        }
        return { place };
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
        const session = buildSessionState(await getRoundMarks(input.wheelId));
        const vetoed = new Set(vetoedIds(session));
        // Dietary constraints: any restaurant carrying an avoided tag is out.
        const avoidedTags = new Set(excludedDietaryTagIds(session));
        const dietaryBlocked = new Set(
          avoidedTags.size === 0
            ? []
            : rests.filter((r) => r.tags.some((t) => avoidedTags.has(t.id))).map((r) => r.id),
        );
        const eligible = input.candidateIds.filter(
          (id) => valid.has(id) && !exclusions.has(id) && !vetoed.has(id) && !dietaryBlocked.has(id),
        );
        if (eligible.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No eligible restaurants to spin" });
        }

        // Base weights: fairness mode favours neglected spots, else uniform.
        // Cuisine rotation, past ratings, and votes then bias the spin on top.
        // A plain wheel with no signals stays a uniform pick.
        const votes = voteCounts(session);
        const hasVotes = votes.size > 0;
        // Persistent preference: the latest "how was it?" per restaurant.
        const ratings = await getLatestRatings(input.wheelId);
        const hasRatings = ratings.size > 0;
        let restaurantId: number;
        if (wheel.fairnessMode || wheel.rotateCuisines || hasVotes || hasRatings) {
          let base: Weighted[];
          if (wheel.fairnessMode) {
            const stats = await getRestaurantStats(input.wheelId);
            const lastPicked = new Map(stats.map((s) => [s.id, s.lastPickedAt]));
            base = computeWeights(eligible.map((id) => ({ restaurantId: id, lastPickedAt: lastPicked.get(id) ?? null })));
          } else {
            base = eligible.map((id) => ({ restaurantId: id, weight: 1 }));
          }
          if (wheel.rotateCuisines) {
            // Each restaurant's cuisine, and when that cuisine was last picked.
            const cuisineOf = new Map(rests.map((r) => [r.id, r.tags.find((t) => t.category === "cuisine")?.id ?? null]));
            const history = await getSpinHistory(input.wheelId);
            const cuisineLastPicked = new Map<number, Date>();
            for (const h of history) {
              const c = cuisineOf.get(h.restaurantId);
              if (c == null) continue;
              const at = new Date(h.spunAt);
              const cur = cuisineLastPicked.get(c);
              if (!cur || at > cur) cuisineLastPicked.set(c, at);
            }
            base = applyCuisineRotation(
              base,
              eligible.map((id) => ({ restaurantId: id, cuisineId: cuisineOf.get(id) ?? null })),
              cuisineLastPicked,
            );
          }
          // Ratings are a persistent preference; votes are the live round signal
          // and apply last so a team can still override "never again" this round.
          base = applyRatingWeights(base, ratings);
          restaurantId = pickWeighted(applyVoteWeights(base, votes));
        } else {
          restaurantId = pickWinner(eligible);
        }
        const id = await recordSpin(input.wheelId, restaurantId, ctx.user.id);
        // The spin is persisted; other members pick it up via spins.latest.
        // Votes belong to the round that just resolved — clear for the next one.
        await clearRoundVotes(input.wheelId);
        return { id, restaurantId };
      }),

    // Most recent spin on a wheel — clients poll this to surface "someone spun"
    // on shared wheels (replaces the old SSE broadcast).
    latest: protectedProcedure
      .input(z.object({ wheelId: z.number() }))
      .query(async ({ ctx, input }) => {
        const isMember = await isWheelMember(input.wheelId, ctx.user.id);
        if (!isMember) throw new TRPCError({ code: "FORBIDDEN" });
        return getLatestSpin(input.wheelId);
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

    // "How was it?" — set/change the verdict on a spin the caller made. Scoped
    // to the caller's own spins (rateSpin checks spunBy), so on a shared wheel
    // you rate your own picks. The latest rating per restaurant then biases
    // future spins via applyRatingWeights.
    rate: protectedProcedure
      .input(z.object({ wheelId: z.number(), spinId: z.number(), rating: z.enum(RATINGS) }))
      .mutation(async ({ ctx, input }) => {
        const isMember = await isWheelMember(input.wheelId, ctx.user.id);
        if (!isMember) throw new TRPCError({ code: "FORBIDDEN" });
        const restaurantId = await rateSpin(input.spinId, input.wheelId, ctx.user.id, input.rating);
        if (restaurantId == null) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Spin not found or not yours to rate" });
        }
        return { success: true, restaurantId };
      }),
  }),

  // ─── Presence ────────────────────────────────────────────────────────────────

  presence: router({
    // "Who's here right now" for a shared wheel. Joining/leaving is driven by the
    // lifetime of this SSE subscription; the server ref-counts connections so a
    // user with multiple tabs shows once and disappears only when all close.
    // Heartbeat + roster in one call: the client polls this (~10s); a user is
    // "online" while their last ping is within the TTL. Multiple tabs collapse
    // to one row (keyed by user), and stale rows simply age out.
    ping: protectedProcedure
      .input(z.object({ wheelId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const isMember = await isWheelMember(input.wheelId, ctx.user.id);
        if (!isMember) throw new TRPCError({ code: "FORBIDDEN" });
        await pingPresence(input.wheelId, ctx.user.id, ctx.user.name);
        const now = Date.now();
        const rows = await getActivePresence(input.wheelId, new Date(now - PRESENCE_TTL_MS));
        return activePresence(rows, now, PRESENCE_TTL_MS);
      }),
  }),

  // ─── Session (vetoes & votes) ─────────────────────────────────────────────────

  session: router({
    // Current round's veto/vote/dietary state — clients poll this (~3s).
    state: protectedProcedure
      .input(z.object({ wheelId: z.number() }))
      .query(async ({ ctx, input }) => {
        const isMember = await isWheelMember(input.wheelId, ctx.user.id);
        if (!isMember) throw new TRPCError({ code: "FORBIDDEN" });
        return buildSessionState(await getRoundMarks(input.wheelId));
      }),

    veto: protectedProcedure
      .input(z.object({ wheelId: z.number(), restaurantId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const isMember = await isWheelMember(input.wheelId, ctx.user.id);
        if (!isMember) throw new TRPCError({ code: "FORBIDDEN" });
        await toggleRoundMark(input.wheelId, "veto", input.restaurantId, ctx.user.id);
        return { success: true };
      }),

    vote: protectedProcedure
      .input(z.object({ wheelId: z.number(), restaurantId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const isMember = await isWheelMember(input.wheelId, ctx.user.id);
        if (!isMember) throw new TRPCError({ code: "FORBIDDEN" });
        await toggleRoundMark(input.wheelId, "vote", input.restaurantId, ctx.user.id);
        return { success: true };
      }),

    dietary: protectedProcedure
      .input(z.object({ wheelId: z.number(), tagId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const isMember = await isWheelMember(input.wheelId, ctx.user.id);
        if (!isMember) throw new TRPCError({ code: "FORBIDDEN" });
        await toggleRoundMark(input.wheelId, "dietary", input.tagId, ctx.user.id);
        return { success: true };
      }),

    clear: protectedProcedure
      .input(z.object({ wheelId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const isMember = await isWheelMember(input.wheelId, ctx.user.id);
        if (!isMember) throw new TRPCError({ code: "FORBIDDEN" });
        await clearRoundAll(input.wheelId);
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

  // ─── Smart Pick (free, no LLM) ──────────────────────────────────────────────

  smart: router({
    // "Decide for me" — a free heuristic. Same eligibility + weighting as a real
    // spin (fairness/rotation/votes), plus an optional mood boost, then a short
    // truthful reason. Server-authoritative: it picks, records, and broadcasts
    // exactly like spins.create — the client never gets to choose the winner.
    pick: protectedProcedure
      .input(
        z.object({
          wheelId: z.number(),
          candidateIds: z.array(z.number()).min(1),
          moodChips: z.array(z.string().max(40)).max(8).optional(),
          moodText: z.string().max(200).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const wheel = await getWheelById(input.wheelId);
        if (!wheel) throw new TRPCError({ code: "NOT_FOUND" });
        const isMember = await isWheelMember(input.wheelId, ctx.user.id);
        if (!isMember) throw new TRPCError({ code: "FORBIDDEN" });

        const rests = await getRestaurantsByWheel(input.wheelId);
        const byId = new Map(rests.map((r) => [r.id, r]));
        const exclusions = await getExclusions(input.wheelId, wheel.exclusionDays);
        const session = buildSessionState(await getRoundMarks(input.wheelId));
        const vetoed = new Set(vetoedIds(session));
        const avoidedTags = new Set(excludedDietaryTagIds(session));
        const dietaryBlocked = new Set(
          avoidedTags.size === 0
            ? []
            : rests.filter((r) => r.tags.some((t) => avoidedTags.has(t.id))).map((r) => r.id),
        );
        const eligibleIds = input.candidateIds.filter(
          (id) => byId.has(id) && !exclusions.has(id) && !vetoed.has(id) && !dietaryBlocked.has(id),
        );
        if (eligibleIds.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No eligible restaurants to pick from" });
        }

        // Days since each spot was last picked (for weighting + the reason).
        const stats = await getRestaurantStats(input.wheelId);
        const lastPicked = new Map(stats.map((s) => [s.id, s.lastPickedAt]));
        const now = Date.now();
        const daysSince = (id: number): number | null => {
          const raw = lastPicked.get(id);
          const t = raw ? new Date(raw as unknown as string).getTime() : NaN;
          return Number.isNaN(t) ? null : Math.floor((now - t) / 86_400_000);
        };

        const candidates: SmartCandidate[] = eligibleIds.map((id) => {
          const r = byId.get(id)!;
          return {
            id,
            name: r.name,
            tags: r.tags.map((t) => t.name),
            cuisine: r.tags.find((t) => t.category === "cuisine")?.name ?? null,
            daysSinceLastPick: daysSince(id),
          };
        });

        // Base weights mirror spins.create: fairness (or uniform) → cuisine
        // rotation → ratings → votes → mood boost. Equal weights collapse to a
        // uniform pick.
        let base: Weighted[];
        if (wheel.fairnessMode) {
          base = computeWeights(
            eligibleIds.map((id) => ({ restaurantId: id, lastPickedAt: (lastPicked.get(id) as Date | null) ?? null })),
          );
        } else {
          base = eligibleIds.map((id) => ({ restaurantId: id, weight: 1 }));
        }
        if (wheel.rotateCuisines) {
          const cuisineOf = new Map(rests.map((r) => [r.id, r.tags.find((t) => t.category === "cuisine")?.id ?? null]));
          const history = await getSpinHistory(input.wheelId);
          const cuisineLastPicked = new Map<number, Date>();
          for (const h of history) {
            const cId = cuisineOf.get(h.restaurantId);
            if (cId == null) continue;
            const at = new Date(h.spunAt);
            const cur = cuisineLastPicked.get(cId);
            if (!cur || at > cur) cuisineLastPicked.set(cId, at);
          }
          base = applyCuisineRotation(
            base,
            eligibleIds.map((id) => ({ restaurantId: id, cuisineId: cuisineOf.get(id) ?? null })),
            cuisineLastPicked,
          );
        }
        base = applyRatingWeights(base, await getLatestRatings(input.wheelId));
        base = applyVoteWeights(base, voteCounts(session));

        const keywords = moodKeywords({ chips: input.moodChips, text: input.moodText });
        base = applyMoodBoost(base, moodBoost(candidates, keywords));

        const restaurantId = pickWeighted(base);
        const chosen = candidates.find((c) => c.id === restaurantId)!;
        const reason = explainPick({ chosen, moodKeywords: keywords, totalCandidates: eligibleIds.length });

        // Record like a normal spin; members pick it up via spins.latest.
        await recordSpin(input.wheelId, restaurantId, ctx.user.id);
        await clearRoundVotes(input.wheelId);
        return { restaurantId, name: chosen.name, reason };
      }),

    // "Smart add" — parse a loose blob into clean names + a best-effort cuisine
    // mapped ONLY to existing wheel tags. Read-only: returns a proposal the
    // client confirms; the actual writes go through restaurants.add/addBulk.
    parseAdd: protectedProcedure
      .input(z.object({ wheelId: z.number(), text: z.string().min(1).max(4000) }))
      .mutation(async ({ ctx, input }) => {
        const isMember = await isWheelMember(input.wheelId, ctx.user.id);
        if (!isMember) throw new TRPCError({ code: "FORBIDDEN" });
        const tags = await getTagsForWheel(input.wheelId);
        const proposals = resolveAddList(
          input.text,
          tags.map((t) => ({ id: t.id, name: t.name, category: t.category })),
        );
        return { proposals };
      }),
  }),
});

export type AppRouter = typeof appRouter;
