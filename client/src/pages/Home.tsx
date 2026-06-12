import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";
import { useLocation } from "wouter";
import { Users, Clock, Tags, Sparkles, ArrowRight } from "lucide-react";

const FEATURES = [
  { icon: Users, label: "Team Wheels", desc: "Decide together, live" },
  { icon: Clock, label: "Smart Exclusion", desc: "No repeats for days" },
  { icon: Tags, label: "Tag Filtering", desc: "Narrow by craving" },
  { icon: Sparkles, label: "Cinematic Design", desc: "A spin worth watching" },
];

export default function Home() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orbRef = useRef<HTMLDivElement>(null);

  // Pointer parallax: the hero wheel drifts toward the cursor for a sense of
  // depth. We write transform directly (no re-render) and keep it subtle.
  const handlePointer = (e: ReactMouseEvent) => {
    const el = orbRef.current;
    if (!el) return;
    const x = e.clientX / window.innerWidth - 0.5;
    const y = e.clientY / window.innerHeight - 0.5;
    el.style.transform = `translate(${x * 22}px, ${y * 22}px)`;
  };

  // Redirect authenticated users to app
  useEffect(() => {
    if (!loading && user) navigate("/app");
  }, [user, loading, navigate]);

  // Animated shader background
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

    const vert = `
      attribute vec2 a_pos;
      void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
    `;
    const frag = `
      precision mediump float;
      uniform float u_time;
      uniform vec2 u_res;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / u_res;
        uv.y = 1.0 - uv.y;
        float t = u_time * 0.15;

        float n1 = noise(uv * 2.5 + vec2(t * 0.3, t * 0.2));
        float n2 = noise(uv * 4.0 + vec2(-t * 0.2, t * 0.4));
        float n3 = noise(uv * 1.5 + vec2(t * 0.1, -t * 0.3));
        float n = (n1 + n2 * 0.5 + n3 * 0.25) / 1.75;

        vec3 deep = vec3(0.03, 0.04, 0.08);
        vec3 orange = vec3(0.85, 0.35, 0.05);
        vec3 purple = vec3(0.35, 0.15, 0.65);
        vec3 mid = vec3(0.06, 0.06, 0.14);

        float dist = length(uv - 0.5);
        vec3 col = mix(deep, mid, n * 0.6);
        col = mix(col, orange * 0.3, smoothstep(0.6, 0.0, dist) * n * 0.4);
        col = mix(col, purple * 0.25, smoothstep(0.5, 0.0, length(uv - vec2(0.8, 0.3))) * n * 0.5);
        col = mix(col, orange * 0.15, smoothstep(0.4, 0.0, length(uv - vec2(0.2, 0.7))) * n * 0.3);

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

    let raf: number;
    const start = performance.now();
    const render = () => {
      const t = (performance.now() - start) / 1000;
      gl.uniform1f(uTime, t);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(render);
    };
    render();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  return (
    <div
      className="relative min-h-screen overflow-hidden flex items-center justify-center"
      onMouseMove={handlePointer}
    >
      {/* Shader background */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ zIndex: 0 }} />

      {/* Noise grain overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 1,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "128px 128px",
          opacity: 0.5,
        }}
      />

      {/* Content */}
      <div className="relative z-10 text-center px-6 max-w-2xl mx-auto py-16">
        {/* Living wheel — a slow-spinning preview of the actual product, with a
            fixed pointer on top and a rotating rim sheen. Drifts on pointer move. */}
        <div className="mb-10 flex justify-center reveal" style={{ animationDelay: "60ms" }}>
          <div ref={orbRef} style={{ transition: "transform 0.3s ease-out" }}>
            <div className="relative animate-float">
              {/* Pointer */}
              <div
                className="absolute left-1/2 -translate-x-1/2 -top-3 z-30"
                style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }}
              >
                <svg width="22" height="26" viewBox="0 0 22 26" fill="none">
                  <path d="M11 24L2 5H20L11 24Z" fill="#fff" stroke="oklch(0.20 0.02 260)" strokeWidth="1.4" strokeLinejoin="round" />
                </svg>
              </div>
              {/* Rotating rim sheen */}
              <div
                className="absolute rounded-full animate-ring-rotate"
                style={{
                  inset: "-7px",
                  background: "conic-gradient(from 0deg, transparent, oklch(0.95 0.02 60 / 0.7), transparent 40%)",
                  filter: "blur(2px)",
                }}
              />
              {/* Spinning wheel face */}
              <div
                className="w-32 h-32 rounded-full animate-orb-spin"
                style={{
                  background: "conic-gradient(from 0deg, #ef4444, #f97316, #eab308, #22c55e, #06b6d4, #8b5cf6, #ec4899, #ef4444)",
                  boxShadow: "0 0 44px oklch(0.72 0.22 30 / 0.55), 0 0 90px oklch(0.65 0.25 280 / 0.3), inset 0 0 0 2px rgba(255,255,255,0.08)",
                }}
              />
              {/* Center hub */}
              <div
                className="absolute inset-0 m-auto w-7 h-7 rounded-full"
                style={{
                  background: "radial-gradient(circle at 35% 30%, #2a2a40, #0d0d1a)",
                  boxShadow: "0 0 0 2px rgba(255,255,255,0.12), 0 2px 8px rgba(0,0,0,0.6)",
                }}
              />
            </div>
          </div>
        </div>

        <h1
          className="text-6xl md:text-8xl font-bold mb-4 leading-none tracking-tight gradient-text reveal"
          style={{ fontFamily: "var(--font-display)", animationDelay: "160ms" }}
        >
          SPIN
          <br />
          YOUR LUNCH
        </h1>

        <p
          className="text-muted-foreground text-lg md:text-xl mb-10 font-light leading-relaxed reveal"
          style={{ animationDelay: "300ms" }}
        >
          Stop debating. Start spinning. A cinematic wheel for teams who can't decide where to eat.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center reveal" style={{ animationDelay: "420ms" }}>
          {loading ? (
            <div className="h-12 w-40 rounded-full bg-white/5 animate-pulse" />
          ) : (
            <a
              href={getLoginUrl()}
              className="group inline-flex items-center justify-center gap-2 px-8 py-3 rounded-full text-sm font-semibold transition-all duration-300 active:scale-95 hover:-translate-y-0.5"
              style={{
                background: "linear-gradient(135deg, oklch(0.72 0.22 30), oklch(0.65 0.25 280))",
                // Glow blends both ends of the button gradient so it reads as the
                // button's own light, not a clash with the cool ambient behind it.
                boxShadow: "0 0 30px oklch(0.72 0.22 30 / 0.35), 0 0 48px oklch(0.65 0.25 280 / 0.25)",
                color: "white",
                fontFamily: "var(--font-display)",
                letterSpacing: "0.05em",
              }}
            >
              <span className="shine">GET STARTED</span>
              <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" />
            </a>
          )}
        </div>

        {/* Feature cards — framed with an icon + one-liner so they sell, not just label. */}
        <div className="mt-16 reveal" style={{ animationDelay: "560ms" }}>
          <p
            className="text-xs tracking-widest mb-4"
            style={{ color: "oklch(0.55 0.03 260)", fontFamily: "var(--font-display)", letterSpacing: "0.18em" }}
          >
            BUILT FOR THE 11:45 SCRAMBLE
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {FEATURES.map(({ icon: Icon, label, desc }, i) => (
              <div
                key={label}
                className="group hover-lift flex flex-col items-center text-center gap-1.5 px-3 py-4 rounded-2xl reveal"
                style={{
                  background: "oklch(0.14 0.025 260 / 0.7)",
                  border: "1px solid oklch(0.22 0.03 260)",
                  animationDelay: `${640 + i * 90}ms`,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "oklch(0.55 0.18 40 / 0.6)"; e.currentTarget.style.boxShadow = "0 10px 30px oklch(0.72 0.22 30 / 0.18)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "oklch(0.22 0.03 260)"; e.currentTarget.style.boxShadow = "none"; }}
              >
                <Icon
                  size={18}
                  className="transition-transform duration-300 group-hover:scale-125 group-hover:-translate-y-0.5"
                  style={{ color: "oklch(0.78 0.2 40)" }}
                />
                <span
                  className="text-xs font-semibold"
                  style={{ color: "oklch(0.88 0.02 260)", fontFamily: "var(--font-display)", letterSpacing: "0.04em" }}
                >
                  {label}
                </span>
                <span className="text-[11px] leading-tight" style={{ color: "oklch(0.58 0.03 260)" }}>
                  {desc}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
