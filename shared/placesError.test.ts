import { describe, it, expect } from "vitest";
import { classifyPlacesStatus, PLACES_QUOTA_MESSAGE } from "./placesError";

describe("classifyPlacesStatus", () => {
  it("treats OK and ZERO_RESULTS as success", () => {
    expect(classifyPlacesStatus("OK")).toBeNull();
    // An empty area is a real answer, not a failure — the caller shows
    // "nothing nearby, widen the search".
    expect(classifyPlacesStatus("ZERO_RESULTS")).toBeNull();
  });

  it("treats a missing status as success (some responses omit it)", () => {
    expect(classifyPlacesStatus(undefined)).toBeNull();
    expect(classifyPlacesStatus(null)).toBeNull();
  });

  // ── The one that costs money ──────────────────────────────────────────────
  it("flags OVER_QUERY_LIMIT as a quota wall", () => {
    const f = classifyPlacesStatus("OVER_QUERY_LIMIT");
    expect(f).not.toBeNull();
    expect(f!.quota).toBe(true);
    expect(f!.code).toBe("TOO_MANY_REQUESTS");
    expect(f!.message).toBe(PLACES_QUOTA_MESSAGE);
  });

  it("flags OVER_DAILY_LIMIT as a quota wall too", () => {
    // Google returns this for a billing cap or a daily quota; same user story.
    const f = classifyPlacesStatus("OVER_DAILY_LIMIT");
    expect(f!.quota).toBe(true);
    expect(f!.code).toBe("TOO_MANY_REQUESTS");
  });

  it("does not mark a quota wall as retryable", () => {
    // Retrying a spent quota just burns another call for another error.
    expect(classifyPlacesStatus("OVER_QUERY_LIMIT")!.retryable).toBe(false);
  });

  // ── Configuration problems ────────────────────────────────────────────────
  it("flags REQUEST_DENIED as a server configuration problem", () => {
    const f = classifyPlacesStatus("REQUEST_DENIED");
    expect(f!.code).toBe("PRECONDITION_FAILED");
    expect(f!.quota).toBe(false);
    expect(f!.retryable).toBe(false);
  });

  it("surfaces Google's own explanation when it gives one", () => {
    // REQUEST_DENIED is uselessly vague on its own; Google's error_message says
    // whether it's billing, a key restriction, or a disabled API.
    const f = classifyPlacesStatus("REQUEST_DENIED", "This API project is not authorized to use this API.");
    expect(f!.message).toContain("not authorized");
  });

  it("does not leak an API key if one ever appears in the provider message", () => {
    const f = classifyPlacesStatus("REQUEST_DENIED", "Bad key=AIzaSyTOTALLYFAKEKEYVALUE1234567 supplied");
    expect(f!.message).not.toContain("AIzaSyTOTALLYFAKEKEYVALUE1234567");
  });

  // ── Transient ─────────────────────────────────────────────────────────────
  it("marks UNKNOWN_ERROR retryable", () => {
    const f = classifyPlacesStatus("UNKNOWN_ERROR");
    expect(f!.code).toBe("BAD_GATEWAY");
    expect(f!.retryable).toBe(true);
  });

  it("classifies an unrecognised status as a generic provider failure", () => {
    const f = classifyPlacesStatus("SOMETHING_NEW");
    expect(f!.code).toBe("BAD_GATEWAY");
    expect(f!.quota).toBe(false);
  });

  it("classifies a bad request without blaming the provider", () => {
    expect(classifyPlacesStatus("INVALID_REQUEST")!.code).toBe("BAD_REQUEST");
  });
});
