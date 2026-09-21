/**
 * Copy text, and report honestly whether it worked.
 *
 * Both call sites used to be `navigator.clipboard.writeText(url)` with an
 * unconditional `toast.success("Invite link copied!")` on the next line, which
 * fails in two different ways and lies in both:
 *
 *  - `navigator.clipboard` is UNDEFINED outside a secure context (plain http —
 *    a preview box, a LAN address, some embedded webviews), so the call throws
 *    synchronously and the toast never runs. The user taps Copy and nothing at
 *    all happens.
 *  - `writeText` returns a promise that rejects on a denied permission or an
 *    unfocused document (Safari and Firefox do this readily). Nothing awaited
 *    it, so that became an unhandled rejection — AND the success toast fired
 *    anyway. The user is told the invite link is on their clipboard, pastes
 *    into Slack, and gets whatever was there before.
 *
 * Telling someone a link is copied when it is not is worse than failing loudly:
 * on a team wheel the invite link IS the product's sharing story. So this
 * awaits, falls back to the pre-clipboard-API `execCommand` path (which works
 * in non-secure contexts), and returns a boolean the caller must act on.
 *
 * Note `navigator.share` right beside these call sites was already handled
 * carefully — the reasoning just never reached the clipboard path.
 */
export async function copyText(text: string): Promise<boolean> {
  // The modern path. Guarded with `?.` because the whole API is absent, not
  // merely unpermitted, on a non-secure origin.
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Denied, or the document was not focused — fall through and try the old way.
  }

  // Legacy fallback: a selection-based copy still works where the async API is
  // unavailable. Off-screen rather than hidden, because a `display:none` or
  // zero-size element cannot hold a selection.
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0";
    document.body.appendChild(el);
    el.select();
    el.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  } catch {
    return false;
  }
}
