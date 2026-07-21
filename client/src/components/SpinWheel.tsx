import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";

export interface WheelSegment {
  id: number;
  label: string;
  color: string;
}

interface SpinWheelProps {
  segments: WheelSegment[];
  onSpinEnd: (segment: WheelSegment) => void;
  isSpinning: boolean;
  onSpinStart: () => void;
  targetId?: number | null;
}

// Deceleration easing: ease-out-quart. Velocity drops fast at first then creeps
// to a stop over a long tail — the dramatic "almost there…" landing. Its initial
// slope is LAND_EASE_SLOPE (=4), which the landDuration formula below uses to
// velocity-match the hand-off from the constant-speed free-spin, so there is no
// visible "lurch faster" when the winner arrives.
const EASE_OUT_QUART = (p: number) => 1 - Math.pow(1 - p, 4);
const LAND_EASE_SLOPE = 4; // EASE_OUT_QUART'(0) — keep in sync with the curve above
const FREE_SPIN_SPEED = 0.026; // rad/ms constant free-spin (~4 turns/s)
// More turns during the deceleration → a longer, more graceful slow-down (the
// duration is derived from distance ÷ speed, then stretched by the easing's
// initial slope). ~2 turns + the quart tail lands in ~2–2.5s.
const MIN_LAND_ROTATIONS = 2; // full turns during the deceleration, min

// Perceived lightness of a #rrggbb segment color (sRGB luma, 0..1). Segment
// fills span light amber to deep blue, so label ink must adapt per slice —
// a fixed white label fails on the light slices.
function hexLuma(hex: string): number {
  const m = /^#?([0-9a-f]{6})/i.exec(hex);
  if (!m) return 0.5;
  const n = parseInt(m[1]!, 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

export default function SpinWheel({ segments, onSpinEnd, isSpinning, onSpinStart, targetId }: SpinWheelProps) {
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const progRef = useRef<WebGLProgram | null>(null);
  const rafRef = useRef<number>(0);
  const bgRafRef = useRef<number>(0);
  const currentAngleRef = useRef<number>(0);
  const [displayAngle, setDisplayAngle] = useState(0);

  // Latest props mirrored into refs so the spin animation can read them without
  // listing them as effect dependencies — otherwise every unrelated re-render
  // (e.g. shared-wheel polling) would restart the spin and it would never stop.
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  const onSpinEndRef = useRef(onSpinEnd);
  onSpinEndRef.current = onSpinEnd;
  const targetIdRef = useRef(targetId);
  targetIdRef.current = targetId;

  // ── WebGL shader background ─────────────────────────────────────────────────
  useEffect(() => {
    const canvas = bgCanvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl");
    if (!gl) return;
    glRef.current = gl;

    const resize = () => {
      const size = Math.min(canvas.parentElement?.clientWidth ?? 400, 500);
      canvas.width = size;
      canvas.height = size;
      gl.viewport(0, 0, size, size);
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const vert = `attribute vec2 a_pos; void main(){gl_Position=vec4(a_pos,0.,1.);}`;
    const frag = `
      precision mediump float;
      uniform float u_time;
      uniform vec2 u_res;
      uniform float u_spin;
      uniform float u_dark; // 1.0 = dark, 0.0 = light

      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){
        vec2 i=floor(p);vec2 f=fract(p);
        f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
      }

      void main(){
        vec2 uv=gl_FragCoord.xy/u_res;
        float t=u_time*0.2;
        float spinPulse=u_spin*0.5;

        float n1=noise(uv*3.+vec2(t*.4,t*.3));
        float n2=noise(uv*5.+vec2(-t*.3,t*.5));
        float n=(n1+n2*.5)/1.5;

        float dist=length(uv-0.5);
        // Warm hero halo behind the wheel: ember ring on a base that matches the
        // theme (warm charcoal in dark, warm cream in light) so it blends.
        vec3 baseDark=vec3(0.06,0.04,0.03);
        vec3 baseLight=vec3(0.965,0.945,0.90);
        vec3 base=mix(baseLight,baseDark,u_dark);
        vec3 ember=vec3(0.92,0.40,0.12);
        vec3 amber=vec3(0.95,0.66,0.22);

        vec3 col=base;
        float ring=smoothstep(0.55,0.45,dist)*smoothstep(0.3,0.5,dist);
        col=mix(col,ember*(0.4+spinPulse*0.6),ring*n*mix(0.5,0.8,u_dark));
        col=mix(col,amber*0.4,smoothstep(0.5,0.0,dist)*n*mix(0.22,0.4,u_dark));
        col+=ember*(0.04+spinPulse*0.15)*smoothstep(0.5,0.0,dist)*mix(0.6,1.0,u_dark);

        gl_FragColor=vec4(col,1.);
      }
    `;

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src); gl.compileShader(s); return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vert));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog); gl.useProgram(prog);
    progRef.current = prog;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, "u_time");
    const uRes = gl.getUniformLocation(prog, "u_res");
    const uSpin = gl.getUniformLocation(prog, "u_spin");
    const uDark = gl.getUniformLocation(prog, "u_dark");
    const start = performance.now();

    const render = () => {
      const t = (performance.now() - start) / 1000;
      const spinVal = isSpinning ? 1.0 : 0.0;
      gl.uniform1f(uTime, t);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uSpin, spinVal);
      gl.uniform1f(uDark, theme === "dark" ? 1 : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      bgRafRef.current = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(bgRafRef.current);
      ro.disconnect();
    };
  }, [isSpinning, theme]);

  // ── Draw pie wheel ──────────────────────────────────────────────────────────
  const drawWheel = useCallback((angle: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Use CSS size for coordinates since we scale the context by devicePixelRatio
    const dpr = window.devicePixelRatio || 1;
    const size = canvas.width / dpr;
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 8;

    // Canvas can't read CSS vars, so resolve the active theme tokens to concrete
    // colors off the element's computed style (re-reads on each draw → flips with
    // the theme).
    const cs = getComputedStyle(canvas);
    const token = (name: string) => cs.getPropertyValue(name).trim() || "#888";

    ctx.clearRect(0, 0, size, size);

    if (segments.length === 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = token("--border");
      ctx.lineWidth = 2;
      ctx.fillStyle = token("--muted");
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = token("--muted-foreground");
      ctx.font = `600 14px ${token("--font-display")}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Add restaurants", cx, cy - 10);
      ctx.fillText("to spin the wheel", cx, cy + 10);
      ctx.restore();
      return;
    }

    const sliceAngle = (Math.PI * 2) / segments.length;

    segments.forEach((seg, i) => {
      const start = angle + i * sliceAngle;
      const end = start + sliceAngle;
      const mid = start + sliceAngle / 2;

      // Segment fill
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, end);
      ctx.closePath();

      // Gradient fill per segment
      const grd = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
      const baseColor = seg.color;
      grd.addColorStop(0, baseColor + "cc");
      grd.addColorStop(1, baseColor + "88");
      ctx.fillStyle = grd;
      ctx.fill();

      // Segment border
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // Glow on segment edge
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, end);
      ctx.closePath();
      ctx.shadowColor = seg.color;
      ctx.shadowBlur = 8;
      ctx.strokeStyle = seg.color + "66";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      // Label — classic prize-wheel typography: text runs along the slice
      // bisector (hub → rim), flipped upright on the left half so nothing
      // renders upside-down. Radial layout keeps each label inside its own
      // slice, so adjacent labels can never collide the way horizontal ones
      // did at the top of the wheel.
      ctx.save();
      ctx.translate(cx, cy);
      const innerR = 34; // clear the hub
      const outerR = r - 14; // breathe at the rim
      const maxWidth = outerR - innerR;
      const fontSize = segments.length > 10 ? 11 : segments.length > 7 ? 12 : 14;
      ctx.font = `600 ${fontSize}px ${token("--font-display")}`;
      ctx.textBaseline = "middle";

      // Ink adapts to the slice: near-black on light fills (amber, sage),
      // white with a soft plate shadow on dark ones.
      if (hexLuma(seg.color) > 0.6) {
        ctx.fillStyle = "rgba(30, 19, 12, 0.92)";
      } else {
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = "rgba(0,0,0,0.55)";
        ctx.shadowBlur = 3;
      }

      let label = seg.label;
      while (ctx.measureText(label).width > maxWidth && label.length > 3) {
        label = label.slice(0, -1);
      }
      if (label !== seg.label) label = label.slice(0, -1) + "…";

      // Which half of the wheel is this slice pointing at right now?
      const facing = ((mid % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      if (facing > Math.PI / 2 && facing < (3 * Math.PI) / 2) {
        // Left half: rotate an extra half-turn and right-align so the text
        // stays upright, occupying the same hub→rim span.
        ctx.rotate(mid + Math.PI);
        ctx.textAlign = "right";
        ctx.fillText(label, -innerR, 0);
      } else {
        ctx.rotate(mid);
        ctx.textAlign = "left";
        ctx.fillText(label, innerR, 0);
      }
      ctx.restore();
    });

    // Center hub — a small dial with a brand-warm keyline so the wheel has a
    // jewel at its pivot instead of a flat dark disc.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    const centerGrd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 22);
    centerGrd.addColorStop(0, token("--card"));
    centerGrd.addColorStop(1, token("--border"));
    ctx.fillStyle = centerGrd;
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 17, 0, Math.PI * 2);
    ctx.strokeStyle = token("--brand");
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // Rim — a defined double keyline (bright inner, dark outer) so the wheel
    // ends with intent instead of dissolving into the glow.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r + 1, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }, [segments, theme]);

  // Sync canvas size with devicePixelRatio for crisp rendering on HiDPI screens
  useEffect(() => {
    const canvas = canvasRef.current;
    const bg = bgCanvasRef.current;
    if (!canvas || !bg) return;
    const dpr = window.devicePixelRatio || 1;
    const cssSize = Math.min(canvas.parentElement?.clientWidth ?? 400, 500);
    canvas.width = cssSize * dpr;
    canvas.height = cssSize * dpr;
    canvas.style.width = cssSize + "px";
    canvas.style.height = cssSize + "px";
    const ctx = canvas.getContext("2d");
    // Use setTransform to avoid accumulating scale on each resize
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawWheel(currentAngleRef.current);
  }, [segments, drawWheel]);

  useEffect(() => {
    drawWheel(displayAngle);
  }, [displayAngle, drawWheel]);

  // Spin animation — two phases so the wheel responds instantly and never
  // stalls on the server round-trip:
  //   1. FREE-SPIN: as soon as isSpinning flips true, the wheel turns at a
  //      constant speed (targetId may still be null while the server picks).
  //   2. LAND: once the winner (targetId) is known, decelerate onto that slice.
  // Depends ONLY on isSpinning, reading segments/onSpinEnd/targetId from refs,
  // so re-renders during the spin can't cancel or restart it.
  useEffect(() => {
    if (!isSpinning) return;
    if (segmentsRef.current.length === 0) return;

    let landing = false;
    let landStart = 0;
    let landFrom = 0;
    let landTo = 0;
    let landDuration = 0;
    let landSegment: WheelSegment | null = null;
    let last = performance.now();

    const beginLanding = (now: number) => {
      const segs = segmentsRef.current;
      const tId = targetIdRef.current;
      const idx = tId == null ? -1 : segs.findIndex((s) => s.id === tId);
      const targetIdx = idx >= 0 ? idx : Math.floor(Math.random() * segs.length);
      landSegment = segs[targetIdx] ?? null;
      const sliceAngle = (Math.PI * 2) / segs.length;
      // Pointer is at top (−π/2); land targetIdx's centre there.
      const targetCenter = -Math.PI / 2 - (targetIdx * sliceAngle + sliceAngle / 2);
      const cur = currentAngleRef.current;
      const dist =
        MIN_LAND_ROTATIONS * Math.PI * 2 +
        (((targetCenter - cur) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      landFrom = cur;
      landTo = cur + dist;
      // Duration chosen so the easing's initial velocity (slope·dist/duration)
      // equals the free-spin speed → the deceleration begins at exactly the speed
      // the wheel was already turning, so there's no jump. Then it eases to a stop.
      landDuration = (LAND_EASE_SLOPE * dist) / FREE_SPIN_SPEED;
      landStart = now;
      landing = true;
    };

    const frame = (now: number) => {
      if (!landing) {
        currentAngleRef.current += FREE_SPIN_SPEED * (now - last);
        last = now;
        setDisplayAngle(currentAngleRef.current);
        if (targetIdRef.current != null) beginLanding(now);
        rafRef.current = requestAnimationFrame(frame);
      } else {
        const progress = Math.min((now - landStart) / landDuration, 1);
        currentAngleRef.current = landFrom + (landTo - landFrom) * EASE_OUT_QUART(progress);
        setDisplayAngle(currentAngleRef.current);
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(frame);
        } else {
          currentAngleRef.current = landTo;
          setDisplayAngle(landTo);
          if (landSegment) onSpinEndRef.current(landSegment);
        }
      }
    };

    // Winner already known at spin-start (e.g. guest wheel) → skip free-spin and
    // decelerate straight away (still at least MIN_LAND_ROTATIONS turns).
    if (targetIdRef.current != null) beginLanding(performance.now());
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isSpinning]);

  const size = 400;

  return (
    <div className="relative flex items-center justify-center" style={{ width: "100%", maxWidth: 500 }}>
      {/* WebGL background glow */}
      <canvas
        ref={bgCanvasRef}
        aria-hidden="true"
        className="absolute rounded-full"
        style={{ width: "100%", height: "100%", maxWidth: 500, maxHeight: 500 }}
      />

      {/* Pointer arrow — sits at the top rim and points inward at the winning slice */}
      <div
        className="absolute z-20 left-1/2 -translate-x-1/2"
        style={{ top: "-14px", filter: "drop-shadow(0 2px 6px var(--brand))" }}
      >
        <svg width="26" height="30" viewBox="0 0 26 30" fill="none">
          <path d="M3 3L23 3L13 26Z" fill="var(--brand)" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Pie wheel canvas */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        width={size}
        height={size}
        className="relative z-10 rounded-full"
        style={{ width: "100%", maxWidth: 500 }}
      />
    </div>
  );
}
