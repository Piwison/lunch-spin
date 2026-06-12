/**
 * Portable wheel export/import format. A wheel exports to a self-contained JSON
 * bundle (no database ids) so it can be shared or backed up and re-imported as a
 * fresh wheel. The same zod schema validates on the way out and the way in, so
 * the server never trusts an unvalidated blob.
 */

import { z } from "zod";

export const WHEEL_EXPORT_VERSION = 1;

export const wheelExportSchema = z.object({
  version: z.literal(WHEEL_EXPORT_VERSION).default(WHEEL_EXPORT_VERSION),
  name: z.string().min(1).max(128),
  exclusionDays: z.number().int().min(0).max(30).default(3),
  fairnessMode: z.boolean().default(false),
  rotateCuisines: z.boolean().default(false),
  restaurants: z
    .array(
      z.object({
        name: z.string().min(1).max(128),
        notes: z.string().max(500).nullable().default(null),
        tags: z
          .array(
            z.object({
              name: z.string().min(1).max(64),
              category: z.enum(["cuisine", "food_type", "custom"]),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});

export type WheelExport = z.infer<typeof wheelExportSchema>;

export interface SerializableWheel {
  name: string;
  exclusionDays: number;
  fairnessMode: boolean;
  rotateCuisines: boolean;
}

export interface SerializableRestaurant {
  name: string;
  notes: string | null;
  tags: { name: string; category: "cuisine" | "food_type" | "custom" }[];
}

/** Shape a wheel + its restaurants into the portable export bundle. */
export function serializeWheel(wheel: SerializableWheel, restaurants: SerializableRestaurant[]): WheelExport {
  return {
    version: WHEEL_EXPORT_VERSION,
    name: wheel.name,
    exclusionDays: wheel.exclusionDays,
    fairnessMode: wheel.fairnessMode,
    rotateCuisines: wheel.rotateCuisines,
    restaurants: restaurants.map((r) => ({
      name: r.name,
      notes: r.notes,
      tags: r.tags.map((t) => ({ name: t.name, category: t.category })),
    })),
  };
}

/** Parse + validate a pasted/uploaded export. Throws a friendly error if bad. */
export function parseWheelImport(raw: string): WheelExport {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("That doesn't look like valid JSON.");
  }
  const result = wheelExportSchema.safeParse(json);
  if (!result.success) {
    throw new Error("That isn't a valid wheel export.");
  }
  return result.data;
}
