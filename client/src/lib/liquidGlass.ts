/**
 * Liquid glass — the refracting edge.
 *
 * Frosted glass and liquid glass are not the same material, and `backdrop-filter:
 * blur()` can only make the first one. A blur averages what is behind a surface;
 * it never MOVES it. Real glass has thickness, so light entering near the rim
 * bends: the content behind an edge is displaced and magnified, and that
 * displacement — not the blur — is what the eye reads as "this is glass" rather
 * than "this is a translucent panel". Measured on the shipped app, every surface
 * was the second thing.
 *
 * The bend is a `feDisplacementMap`. Chromium accepts an SVG filter REFERENCE in
 * `backdrop-filter` (`backdrop-filter: url(#id) …`), which means the backdrop can
 * be pushed around per-pixel before it is composited. The push comes from a
 * displacement map generated here: the signed distance field of the surface's own
 * rounded rectangle, with the outward normal encoded in R/G and the strength
 * ramped from zero at `band` px inside the edge to full at the edge itself.
 *
 * Two constraints shape the API:
 *
 *   1. The map depends on the element's measured size and radius, so it cannot
 *      live in a stylesheet. JS supplies only the filter REFERENCE, as a custom
 *      property; index.css still owns the blur, the saturation and the band, so
 *      there is exactly one place that writes a backdrop-filter.
 *   2. Browsers that ignore filter references in backdrop-filter lose the
 *      refraction and keep everything else. The reference goes on the ::after
 *      lens ring, which has no fill of its own — the surface's own blur and tint
 *      sit on the element and are never touched.
 */

const NS = "http://www.w3.org/2000/svg";

/** The host <svg> holding every generated filter. One per document. */
let host: SVGSVGElement | null = null;
let seq = 0;

function ensureHost(): SVGSVGElement {
  if (host?.isConnected) return host;
  host = document.createElementNS(NS, "svg");
  host.setAttribute("aria-hidden", "true");
  host.setAttribute("width", "0");
  host.setAttribute("height", "0");
  host.style.position = "absolute";
  host.style.width = "0";
  host.style.height = "0";
  host.style.overflow = "hidden";
  host.style.pointerEvents = "none";
  document.body.appendChild(host);
  return host;
}

/** Signed distance to a rounded rectangle centred on the origin. Negative inside. */
function sdRoundRect(px: number, py: number, halfW: number, halfH: number, r: number): number {
  const qx = Math.abs(px) - halfW + r;
  const qy = Math.abs(py) - halfH + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

/**
 * The displacement map, as a data URL.
 *
 * R = x offset, G = y offset, both around a neutral 128. Outside the band the
 * channels stay at 128, so the interior of the surface is displaced by exactly
 * zero and only the rim moves — the whole map can therefore cover the element's
 * full box and still leave the middle alone.
 */
function buildMap(w: number, h: number, radius: number, band: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const image = ctx.createImageData(w, h);
  const data = image.data;
  const halfW = w / 2;
  const halfH = h / 2;
  const r = Math.min(radius, halfW, halfH);
  const e = 0.5;

  // Neutral everywhere, as ONE 32-bit fill. Every pixel needs B=128 and A=255
  // anyway and the interior needs R=G=128, so the band loop below can leave the
  // rest alone. Writing the alpha byte in a JS loop was measured costing more
  // than the geometry it was there to save (`data.fill(128)` plus 936k
  // iterations on a phone-sized sheet); a Uint32 view fills all four channels at
  // once and is what took the sheet case from 12.6ms to 5.9ms.
  const littleEndian = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  new Uint32Array(data.buffer).fill(littleEndian ? 0xff808080 : 0x808080ff);

  // Only the band is worth computing, and on anything bigger than a chip the
  // band is a small fraction of the box: a 390x600 sheet is 234k pixels, of
  // which ~50k are within 14px of an edge. Visiting all of them cost 15.6ms
  // measured — a dropped frame at exactly the moment a sheet opens and starts
  // animating. Rows in the vertical middle only meet the left and right edges,
  // so they need two short spans; only rows within `band + r` of the top or
  // bottom can touch a corner arc and have to be walked in full.
  const edgeRow = halfH - band - r;
  const span = Math.ceil(band) + 2;

  for (let y = 0; y < h; y++) {
    const py = y + 0.5 - halfH;
    const nearCorner = Math.abs(py) > edgeRow;

    for (let x = 0; x < w; x++) {
      if (!nearCorner && x >= span && x < w - span) {
        // Jump straight to the far edge's span rather than testing every pixel.
        x = w - span - 1;
        continue;
      }

      const px = x + 0.5 - halfW;
      const d = sdRoundRect(px, py, halfW, halfH, r);
      if (d < -band || d > 0) continue;

      // Outward normal, by central difference on the distance field.
      const gx = sdRoundRect(px + e, py, halfW, halfH, r) - sdRoundRect(px - e, py, halfW, halfH, r);
      const gy = sdRoundRect(px, py + e, halfW, halfH, r) - sdRoundRect(px, py - e, halfW, halfH, r);
      const len = Math.hypot(gx, gy) || 1;

      // Strength ramps in from the inner edge of the band. The exponent is what
      // keeps the transition invisible: linear leaves a hard seam where the
      // displacement starts, and a lens has no seam.
      const t = (d + band) / band;
      const s = t * t * (3 - 2 * t) * t;

      const k = (y * w + x) * 4;
      data[k] = Math.round(128 + (gx / len) * s * 127);
      data[k + 1] = Math.round(128 + (gy / len) * s * 127);
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL();
}

export type LiquidGlassOptions = {
  /**
   * Thickness of the refracting band, in CSS px. Overrides the surface's
   * `--glass-lens-band`, which is normally the right answer — the band has to
   * match the ::after ring's padding, and index.css sets both from one token.
   */
  band?: number;
  /**
   * How far the rim pulls the backdrop, in px. Defaults to the band width, which
   * is the largest value that still reads as one lens: pull the backdrop further
   * than the band is wide and the band splits into two steps with a seam.
   */
  strength?: number;
};

/**
 * Attach a refracting edge to one glass surface. Returns a teardown.
 *
 * The element keeps its own class (`glass-bar`, `glass-sheet`, …) and everything
 * that comes with it; this only sets `--lens-filter`, which index.css folds into
 * the lens ring's backdrop-filter.
 */
export function attachLiquidGlass(el: HTMLElement, options: LiquidGlassOptions = {}): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  // No backdrop-filter at all means no glass to refract; the surface falls back
  // to its opaque fill and this would only cost frames.
  if (!window.CSS?.supports?.("backdrop-filter", "blur(1px)")) return () => {};

  const id = `lens-${++seq}`;
  const svg = ensureHost();

  const filter = document.createElementNS(NS, "filter");
  filter.setAttribute("id", id);
  filter.setAttribute("x", "0");
  filter.setAttribute("y", "0");
  filter.setAttribute("width", "100%");
  filter.setAttribute("height", "100%");
  filter.setAttribute("color-interpolation-filters", "sRGB");

  const feImage = document.createElementNS(NS, "feImage");
  feImage.setAttribute("preserveAspectRatio", "none");
  feImage.setAttribute("result", "map");

  const feDisplace = document.createElementNS(NS, "feDisplacementMap");
  feDisplace.setAttribute("in", "SourceGraphic");
  feDisplace.setAttribute("in2", "map");
  feDisplace.setAttribute("xChannelSelector", "R");
  feDisplace.setAttribute("yChannelSelector", "G");

  filter.append(feImage, feDisplace);
  svg.appendChild(filter);

  let lastKey = "";
  let frame = 0;

  const measure = () => {
    frame = 0;
    const rect = el.getBoundingClientRect();
    // A map is worth generating only once the surface has a real box; a sheet
    // measured mid-transition would bake in an intermediate size.
    if (rect.width < 24 || rect.height < 24) return;

    const cs = getComputedStyle(el);
    const radius = parseFloat(cs.borderTopLeftRadius) || 0;

    // The band comes from the surface's own token, so a dock and a sheet differ
    // in one place — index.css — rather than at every call site.
    const band = options.band ?? (parseFloat(cs.getPropertyValue("--glass-lens-band")) || 14);
    const strength = options.strength ?? band;

    // Generated at CSS-pixel resolution, capped: the map is stretched back over
    // the element by the filter, and past this size the extra samples buy
    // nothing a 14px band can show.
    const cap = 900;
    const k = Math.min(1, cap / Math.max(rect.width, rect.height));
    const w = Math.max(2, Math.round(rect.width * k));
    const h = Math.max(2, Math.round(rect.height * k));

    const key = `${w}x${h}r${Math.round(radius * k)}b${Math.round(band * k)}s${strength}`;
    if (key === lastKey) return;
    lastKey = key;

    const url = buildMap(w, h, radius * k, Math.max(1, band * k));
    if (!url) return;
    feImage.setAttribute("href", url);
    // The map is stretched back to the element's box, so the displacement it
    // encodes has to be scaled back up by the same factor.
    feDisplace.setAttribute("scale", String(strength / k));
    el.style.setProperty("--lens-filter", `url(#${id})`);
  };

  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(measure);
  };

  const observer = new ResizeObserver(schedule);
  observer.observe(el);
  schedule();

  return () => {
    if (frame) cancelAnimationFrame(frame);
    observer.disconnect();
    filter.remove();
    el.style.removeProperty("--lens-filter");
  };
}

/** Elements currently carrying a lens, so the observer never attaches twice. */
const attached = new WeakMap<Element, () => void>();

/**
 * Which surfaces get a refracting edge.
 *
 * The glass classes themselves, rather than an opt-in attribute, because
 * index.css draws the lens RING on exactly this set — and a ring without a
 * displacement map is a ring that pretends to refract and does not. Tying both
 * to one list is what stops the two from drifting apart.
 *
 * The app header (`.glass-bar--bottom`) is in the set too. It has three edges
 * off-screen, so index.css swaps its ring for a strip along the one rim it
 * actually has — but the strip refracts through the same map, which is what
 * makes the header read as a pane the page slides under.
 *
 * `data-lens` / `.lens` stay available for surfaces that are glass without
 * carrying one of the class names — sonner writes its toasts a className and
 * nothing else.
 */
export const LENS_SELECTOR =
  ".glass, .glass-nav, .glass-bar, .glass-sheet, .glass-card, [data-lens], .lens";

function bind(el: Element) {
  if (!(el instanceof HTMLElement) || attached.has(el)) return;
  attached.set(el, attachLiquidGlass(el));
}

function unbind(el: Element) {
  const detach = attached.get(el);
  if (!detach) return;
  detach();
  attached.delete(el);
}

/**
 * Watch the document for glass surfaces and keep their refracting edges in sync.
 *
 * Marking a surface `data-lens` is the whole opt-in. The observer exists because
 * the surfaces that most need a lens are the ones a component tree cannot hand a
 * ref to: toasts, dialogs and dropdowns all render through portals into a
 * container the app does not own, and they mount and unmount constantly. A ref
 * would cover the dock and miss every overlay — which is exactly the set the
 * "this is just a darker layer" complaint was about.
 *
 * Call once, at the app root. Returns a teardown.
 */
export function observeLiquidGlass(root: ParentNode = document.body): () => void {
  if (typeof document === "undefined") return () => {};

  root.querySelectorAll(LENS_SELECTOR).forEach(bind);

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") {
        const el = record.target as Element;
        if (el.matches(LENS_SELECTOR)) bind(el);
        else unbind(el);
        continue;
      }
      record.removedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        unbind(node);
        node.querySelectorAll(LENS_SELECTOR).forEach(unbind);
      });
      record.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node.matches(LENS_SELECTOR)) bind(node);
        node.querySelectorAll(LENS_SELECTOR).forEach(bind);
      });
    }
  });

  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-lens", "class"],
  });

  return () => observer.disconnect();
}
