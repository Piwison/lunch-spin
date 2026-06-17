import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useLocation } from "wouter";
import { Users, Clock, Tags, Sparkles, ArrowRight, ChevronDown, Utensils, Play } from "lucide-react";
import { trpc } from "@/lib/trpc";
import ThemeToggle from "@/components/ThemeToggle";
import { useTheme } from "@/contexts/ThemeContext";

const FEATURES = [
  { icon: Users, label: "Team Wheels", desc: "Shared wheels for your whole squad", accent: "var(--brand)" },
  { icon: Clock, label: "Smart Exclusion", desc: "Auto-skip recently picked spots", accent: "var(--brand-2)" },
  { icon: Tags, label: "Tag Filtering", desc: "Filter by cuisine or food type", accent: "oklch(0.70 0.20 160)" },
  { icon: Sparkles, label: "Cinematic Design", desc: "A spin worth watching every time", accent: "var(--brand-2)" },
];

const STATS = [
  { value: "10s", label: "to decide lunch" },
  { value: "0", label: "arguments" },
  { value: "∞", label: "restaurants" },
];

export default function Home() {
  const { user, loading } = useAuth();
  const { theme } = useTheme();
  const [, navigate] = useLocation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orbRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const cursorDotRef = useRef<HTMLDivElement>(null);
  const [hoveredFeature, setHoveredFeature] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const rafRef = useRef<number>(0);
  const cursorPos = useRef({ x: 0, y: 0 });
  const targetPos = useRef({ x: 0, y: 0 });

  // Popular public wheels — guests can try one without signing in.
  const { data: popularWheels } = trpc.wheels.listPublic.useQuery({ limit: 6 });

  // Apply an alpha to any CSS color (incl. var() tokens) via relative color syntax.
  const alpha = (c: string, a: number) => `oklch(from ${c} l c h / ${a})`;

  useEffect(() => {
    if (!loading && user) navigate("/app");
  }, [user, loading, navigate]);

  // Smooth magnetic cursor
  useEffect(() => {
    const moveCursor = (e: MouseEvent) => {
      targetPos.current = { x: e.clientX, y: e.clientY };
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", moveCursor);

    const animateCursor = () => {
      const dx = targetPos.current.x - cursorPos.current.x;
      const dy = targetPos.current.y - cursorPos.current.y;
      cursorPos.current.x += dx * 0.12;
      cursorPos.current.y += dy * 0.12;
      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate(${cursorPos.current.x - 20}px, ${cursorPos.current.y - 20}px)`;
      }
      if (cursorDotRef.current) {
        cursorDotRef.current.style.transform = `translate(${targetPos.current.x - 3}px, ${targetPos.current.y - 3}px)`;
      }
      rafRef.current = requestAnimationFrame(animateCursor);
    };
    rafRef.current = requestAnimationFrame(animateCursor);

    return () => {
      window.removeEventListener("mousemove", moveCursor);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Pointer parallax on hero orb
  const handlePointer = (e: ReactMouseEvent) => {
    const el = orbRef.current;
    if (!el) return;
    const x = e.clientX / window.innerWidth - 0.5;
    const y = e.clientY / window.innerHeight - 0.5;
    el.style.transform = `translate(${x * 30}px, ${y * 30}px)`;
  };

  // WebGL shader background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl");
    if (!gl) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    const vert = `attribute vec2 a_pos; void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;
    const frag = `
      precision mediump float;
      uniform float u_time;
      uniform vec2 u_res;
      uniform vec2 u_mouse;
      uniform float u_dark; // 1.0 = dark (warm charcoal), 0.0 = light (warm cream)

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float v = 0.0; float a = 0.5;
        for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
        return v;
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / u_res;
        uv.y = 1.0 - uv.y;
        float t = u_time * 0.12;
        vec2 mouse = u_mouse / u_res;

        float n = fbm(uv * 2.2 + vec2(t * 0.25, t * 0.18));
        float n2 = fbm(uv * 3.5 - vec2(t * 0.15, t * 0.3));

        // Mouse-reactive light
        float mouseDist = length(uv - mouse);
        float mouseGlow = smoothstep(0.5, 0.0, mouseDist) * 0.35;

        // Warm Appetite palette — a single tomato/ember + amber, no cold purple.
        // Base is warm charcoal in dark mode, warm cream in light. Tints are
        // additive and warm in both modes (just gentler in light so cream stays
        // bright and content stays legible).
        vec3 deepDark  = vec3(0.055, 0.035, 0.028);
        vec3 deepLight = vec3(0.965, 0.945, 0.90);
        vec3 deep = mix(deepLight, deepDark, u_dark);
        vec3 ember = vec3(0.92, 0.36, 0.16); // tomato
        vec3 amber = vec3(0.95, 0.66, 0.22); // mango
        float tint = mix(0.10, 0.30, u_dark);

        float dist = length(uv - 0.5);
        vec3 col = mix(deep, deep * mix(0.97, 1.4, u_dark), n * 0.5);
        col += ember * smoothstep(0.7, 0.0, length(uv - vec2(0.15, 0.85))) * n * tint;
        col += amber * smoothstep(0.6, 0.0, length(uv - vec2(0.85, 0.15))) * n2 * tint * 1.1;
        col += ember * smoothstep(0.5, 0.0, length(uv - vec2(0.5, 0.5))) * n * tint * 0.45;
        col += ember * mouseGlow * n;
        col += amber * mouseGlow * 0.5;

        // Vignette (warm down in dark, gentle in light)
        col *= 1.0 - smoothstep(0.3, 0.9, dist) * (0.6 * u_dark + 0.12);

        gl_FragColor = vec4(col, 1.0);
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

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, "u_time");
    const uRes = gl.getUniformLocation(prog, "u_res");
    const uMouse = gl.getUniformLocation(prog, "u_mouse");
    const uDark = gl.getUniformLocation(prog, "u_dark");

    let raf: number;
    let mx = 0, my = 0;
    const onMove = (e: MouseEvent) => { mx = e.clientX; my = e.clientY; };
    window.addEventListener("mousemove", onMove);

    const start = performance.now();
    const render = () => {
      const t = (performance.now() - start) / 1000;
      gl.uniform1f(uTime, t);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform2f(uMouse, mx, canvas.height - my);
      gl.uniform1f(uDark, theme === "dark" ? 1 : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(render);
    };
    render();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
    };
  }, [theme]);

  return (
    <div
      className="relative min-h-screen overflow-x-hidden overflow-y-auto"
      onMouseMove={handlePointer}
      style={{ cursor: "none" }}
    >
      {/* Custom cursor (desktop only) */}
      <div
        ref={cursorRef}
        className="fixed top-0 left-0 w-10 h-10 rounded-full pointer-events-none z-[9999] hidden md:block"
        style={{
          border: "1px solid oklch(from var(--brand) l c h / 0.6)",
          transition: "width 0.2s, height 0.2s, border-color 0.2s",
          mixBlendMode: "difference",
        }}
      />
      <div
        ref={cursorDotRef}
        className="fixed top-0 left-0 w-1.5 h-1.5 rounded-full pointer-events-none z-[9999] hidden md:block"
        style={{ background: "var(--brand)", boxShadow: "0 0 6px var(--brand)" }}
      />

      {/* Theme toggle */}
      <div className="fixed top-3 right-3 z-30" style={{ cursor: "auto" }}>
        <ThemeToggle />
      </div>

      {/* Shader background */}
      <canvas ref={canvasRef} className="fixed inset-0 w-full h-full" style={{ zIndex: 0 }} />

      {/* Grain overlay */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          zIndex: 1,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.035'/%3E%3C/svg%3E")`,
          backgroundSize: "128px 128px",
          opacity: 0.6,
        }}
      />

      {/* ── HERO ── */}
      <section className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 pt-16 pb-24">

        {/* Floating orb */}
        <div className="mb-10 flex justify-center reveal" style={{ animationDelay: "40ms" }}>
          <div ref={orbRef} style={{ transition: "transform 0.4s cubic-bezier(0.23, 1, 0.32, 1)" }}>
            <div className="relative animate-float">
              {/* Outer glow rings */}
              <div
                className="absolute rounded-full animate-ring-rotate"
                style={{
                  inset: "-16px",
                  background: "conic-gradient(from 0deg, transparent 0%, oklch(from var(--brand) l c h / 0.5) 25%, transparent 50%, oklch(from var(--brand-2) l c h / 0.4) 75%, transparent 100%)",
                  filter: "blur(3px)",
                }}
              />
              <div
                className="absolute rounded-full"
                style={{
                  inset: "-8px",
                  background: "conic-gradient(from 180deg, transparent 0%, oklch(from var(--brand-2) l c h / 0.3) 30%, transparent 60%)",
                  filter: "blur(2px)",
                  animation: "ring-rotate 8s linear infinite reverse",
                }}
              />
              {/* Pointer */}
              <div className="absolute left-1/2 -translate-x-1/2 -top-4 z-30" style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.6))" }}>
                <svg width="20" height="24" viewBox="0 0 20 24" fill="none">
                  <path d="M10 22L1.5 4.5H18.5L10 22Z" fill="white" stroke="var(--muted)" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
              </div>
              {/* Wheel face */}
              <div
                className="w-36 h-36 rounded-full animate-orb-spin"
                style={{
                  background: "conic-gradient(from 0deg, var(--brand), var(--brand-2), var(--brand))",
                  boxShadow: "0 0 60px oklch(from var(--brand) l c h / 0.5), 0 0 120px oklch(from var(--brand-2) l c h / 0.25), inset 0 0 0 2px rgba(255,255,255,0.1)",
                }}
              />
              {/* Center hub */}
              <div
                className="absolute inset-0 m-auto w-8 h-8 rounded-full"
                style={{
                  background: "radial-gradient(circle at 35% 30%, var(--border), var(--background))",
                  boxShadow: "0 0 0 2px rgba(255,255,255,0.1), 0 2px 12px rgba(0,0,0,0.7)",
                }}
              />
            </div>
          </div>
        </div>

        {/* Headline — split into two lines with different weights for rhythm */}
        <div className="text-center mb-6">
          <h1
            className="reveal"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(3.5rem, 12vw, 9rem)",
              fontWeight: 900,
              lineHeight: 0.9,
              letterSpacing: "-0.03em",
              animationDelay: "120ms",
            }}
          >
            <span className="gradient-text">SPIN</span>
          </h1>
          <h1
            className="reveal"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(3.5rem, 12vw, 9rem)",
              fontWeight: 900,
              lineHeight: 0.9,
              letterSpacing: "-0.03em",
              color: "var(--foreground)",
              animationDelay: "200ms",
            }}
          >
            YOUR LUNCH
          </h1>
        </div>

        <p
          className="text-center text-muted-foreground text-lg md:text-xl mb-12 max-w-md font-light leading-relaxed reveal"
          style={{ animationDelay: "320ms" }}
        >
          Stop debating. Start spinning. The cinematic lunch wheel for teams who can't decide.
        </p>

        {/* CTA */}
        <div className="reveal" style={{ animationDelay: "440ms" }}>
          {loading ? (
            <div className="h-14 w-48 rounded-full bg-white/5 animate-pulse" />
          ) : (
            <a
              href={getLoginUrl()}
              className="group relative inline-flex items-center justify-center gap-3 px-10 py-4 rounded-full text-sm font-bold tracking-widest transition-all duration-300 active:scale-95 hover:-translate-y-1"
              style={{
                fontFamily: "var(--font-display)",
                background: "linear-gradient(135deg, var(--brand), var(--brand-2))",
                boxShadow: "0 0 40px oklch(from var(--brand) l c h / 0.4), 0 0 80px oklch(from var(--brand-2) l c h / 0.2), 0 8px 32px rgba(0,0,0,0.4)",
                color: "white",
                cursor: "none",
              }}
              onMouseEnter={() => {
                if (cursorRef.current) {
                  cursorRef.current.style.width = "60px";
                  cursorRef.current.style.height = "60px";
                  cursorRef.current.style.borderColor = "var(--brand)";
                }
              }}
              onMouseLeave={() => {
                if (cursorRef.current) {
                  cursorRef.current.style.width = "40px";
                  cursorRef.current.style.height = "40px";
                  cursorRef.current.style.borderColor = "oklch(from var(--brand) l c h / 0.6)";
                }
              }}
            >
              {/* Shimmer sweep */}
              <span
                className="absolute inset-0 rounded-full overflow-hidden"
                style={{ pointerEvents: "none" }}
              >
                <span
                  className="absolute inset-0"
                  style={{
                    background: "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%)",
                    backgroundSize: "200% 100%",
                    animation: "shimmer 3s linear infinite",
                  }}
                />
              </span>
              <span>GET STARTED</span>
              <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1.5" />
            </a>
          )}
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 reveal" style={{ animationDelay: "700ms" }}>
          <span className="text-xs tracking-widest text-muted-foreground" style={{ fontFamily: "var(--font-display)" }}>SCROLL</span>
          <ChevronDown size={14} className="text-muted-foreground animate-bounce" />
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <section className="relative z-10 py-12 px-6">
        <div
          className="max-w-3xl mx-auto grid grid-cols-3 gap-4 rounded-2xl p-6"
          style={{
            background: "oklch(from var(--card) l c h / 0.6)",
            border: "1px solid var(--border)",
            backdropFilter: "blur(20px)",
          }}
        >
          {STATS.map(({ value, label }, i) => (
            <div key={label} className="text-center reveal" style={{ animationDelay: `${i * 80}ms` }}>
              <div
                className="text-4xl md:text-5xl font-black mb-1 gradient-text"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {value}
              </div>
              <div className="text-xs text-muted-foreground tracking-widest uppercase" style={{ fontFamily: "var(--font-display)" }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="relative z-10 py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <p
            className="text-center text-xs tracking-[0.2em] mb-12 reveal"
            style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-display)" }}
          >
            BUILT FOR THE 11:45 SCRAMBLE
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {FEATURES.map(({ icon: Icon, label, desc, accent }, i) => (
              <div
                key={label}
                className="group relative overflow-hidden rounded-2xl p-6 cursor-none reveal"
                style={{
                  background: hoveredFeature === i
                    ? `oklch(from var(--card) l c h / 0.9)`
                    : "oklch(from var(--card) l c h / 0.6)",
                  border: `1px solid ${hoveredFeature === i ? alpha(accent, 0.33) : "var(--border)"}`,
                  backdropFilter: "blur(16px)",
                  transition: "all 0.3s cubic-bezier(0.23, 1, 0.32, 1)",
                  transform: hoveredFeature === i ? "translateY(-4px)" : "none",
                  boxShadow: hoveredFeature === i ? `0 20px 40px ${alpha(accent, 0.13)}, 0 0 0 1px ${alpha(accent, 0.2)}` : "none",
                  animationDelay: `${i * 100}ms`,
                }}
                onMouseEnter={() => setHoveredFeature(i)}
                onMouseLeave={() => setHoveredFeature(null)}
              >
                {/* Accent glow blob */}
                <div
                  className="absolute -top-8 -right-8 w-32 h-32 rounded-full pointer-events-none"
                  style={{
                    background: accent,
                    filter: "blur(40px)",
                    opacity: hoveredFeature === i ? 0.15 : 0,
                    transition: "opacity 0.4s",
                  }}
                />
                <div className="flex items-start gap-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110"
                    style={{ background: alpha(accent, 0.13), border: `1px solid ${alpha(accent, 0.27)}` }}
                  >
                    <Icon size={18} style={{ color: accent }} />
                  </div>
                  <div>
                    <h3
                      className="font-bold mb-1 text-sm tracking-wide"
                      style={{ fontFamily: "var(--font-display)", color: "var(--foreground)" }}
                    >
                      {label.toUpperCase()}
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── POPULAR WHEELS (try without signing in) ── */}
      {popularWheels && popularWheels.length > 0 && (
        <section className="relative z-10 py-16 px-6">
          <div className="max-w-4xl mx-auto">
            <p
              className="text-center text-xs tracking-[0.2em] mb-3 reveal"
              style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-display)" }}
            >
              TRY WITHOUT SIGNING IN
            </p>
            <h2
              className="text-center text-2xl md:text-3xl font-black mb-10 gradient-text reveal"
              style={{ fontFamily: "var(--font-display)" }}
            >
              POPULAR WHEELS
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {popularWheels.map((w, i) => (
                <button
                  key={w.id}
                  onClick={() => navigate(`/w/${w.id}`)}
                  className="group relative overflow-hidden rounded-2xl p-5 text-left cursor-none reveal transition-all duration-300 hover:-translate-y-1"
                  style={{
                    background: "oklch(from var(--card) l c h / 0.6)",
                    border: "1px solid var(--border)",
                    backdropFilter: "blur(16px)",
                    animationDelay: `${i * 80}ms`,
                  }}
                >
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110"
                      style={{ background: "oklch(from var(--brand) l c h / 0.15)", border: "1px solid oklch(from var(--brand) l c h / 0.30)" }}
                    >
                      <Utensils size={16} style={{ color: "var(--brand)" }} />
                    </div>
                    <span
                      className="flex items-center gap-1.5 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: "var(--brand)", fontFamily: "var(--font-display)" }}
                    >
                      SPIN <Play size={11} />
                    </span>
                  </div>
                  <h3
                    className="font-bold text-base mb-1 truncate"
                    style={{ fontFamily: "var(--font-display)", color: "var(--foreground)" }}
                  >
                    {w.name}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {w.restaurantCount} restaurant{w.restaurantCount !== 1 ? "s" : ""}
                    {w.spinCount > 0 && ` · ${w.spinCount} spin${w.spinCount !== 1 ? "s" : ""}`}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── FINAL CTA ── */}
      <section className="relative z-10 py-24 px-6 text-center">
        <div
          className="max-w-2xl mx-auto rounded-3xl p-12 reveal"
          style={{
            background: "oklch(from var(--card) l c h / 0.7)",
            border: "1px solid var(--border)",
            backdropFilter: "blur(24px)",
            boxShadow: "0 0 80px oklch(from var(--brand) l c h / 0.08), 0 0 120px oklch(from var(--brand-2) l c h / 0.06)",
          }}
        >
          <div className="text-4xl mb-4">🎡</div>
          <h2
            className="text-3xl md:text-4xl font-black mb-4 gradient-text"
            style={{ fontFamily: "var(--font-display)" }}
          >
            READY TO SPIN?
          </h2>
          <p className="text-muted-foreground mb-8 text-sm leading-relaxed">
            Create your first wheel in seconds. Add your team's favourite spots and let fate decide.
          </p>
          {!loading && (
            <a
              href={getLoginUrl()}
              className="group inline-flex items-center gap-2 px-8 py-3 rounded-full text-sm font-bold tracking-widest transition-all duration-300 active:scale-95 hover:-translate-y-0.5"
              style={{
                fontFamily: "var(--font-display)",
                background: "linear-gradient(135deg, var(--brand), var(--brand-2))",
                boxShadow: "0 0 30px oklch(from var(--brand) l c h / 0.3), 0 4px 20px rgba(0,0,0,0.4)",
                color: "white",
                cursor: "none",
              }}
            >
              START FOR FREE
              <ArrowRight size={14} className="transition-transform duration-300 group-hover:translate-x-1" />
            </a>
          )}
        </div>
      </section>
    </div>
  );
}
