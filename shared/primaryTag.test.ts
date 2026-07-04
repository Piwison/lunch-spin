import { describe, expect, it } from "vitest";
import { primaryTag } from "./primaryTag";

const tag = (id: number, color: string) => ({ id, color, name: `tag-${id}` });

describe("primaryTag", () => {
  it("returns the tag matching primaryTagId, even when it isn't first", () => {
    const r = { primaryTagId: 3, tags: [tag(1, "#a"), tag(3, "#c"), tag(2, "#b")] };
    expect(primaryTag(r)?.id).toBe(3);
    expect(primaryTag(r)?.color).toBe("#c");
  });

  it("falls back to the first tag when primaryTagId is null", () => {
    const r = { primaryTagId: null, tags: [tag(1, "#a"), tag(2, "#b")] };
    expect(primaryTag(r)?.id).toBe(1);
  });

  it("falls back to the first tag when primaryTagId is undefined", () => {
    const r = { tags: [tag(7, "#g")] };
    expect(primaryTag(r)?.id).toBe(7);
  });

  it("falls back to the first tag when primaryTagId points at a detached tag", () => {
    // primaryTagId references a tag no longer in the array (e.g. it was removed).
    const r = { primaryTagId: 99, tags: [tag(1, "#a"), tag(2, "#b")] };
    expect(primaryTag(r)?.id).toBe(1);
  });

  it("returns null when there are no tags", () => {
    expect(primaryTag({ primaryTagId: 5, tags: [] })).toBeNull();
    expect(primaryTag({ primaryTagId: null, tags: [] })).toBeNull();
  });
});
