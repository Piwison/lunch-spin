import { useCallback, useEffect, useRef, useState } from "react";
import { computeSpin } from "@shared/wheel";

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
  /** Server-chosen winning restaurant id; the wheel animates to its segment. */
  targetId?: number | null;
}

const EASE_OUT = (t: number) => 1 - Math.pow(1 - t, 4);
const SPIN_DURATION = 5000; // ms
const MIN_ROTATIONS = 6;

export default function SpinWheel({ segments, onSpinEnd, isSpinning, onSpinStart, targetId }: SpinWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const progRef = useRef<WebGLProgram | null>(null);
  const rafRef = useRef<number>(0);
  const bgRafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const startAngleRef = useRef<number>(0);
  const targetAngleRef = useRef<number>(0);
  const currentAngleRef = useRef<number>(0);
  const [displayAngle, setDisplayAngle] = useState(0);

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
        vec3 dark=vec3(0.04,0.04,0.10);
        vec3 orange=vec3(0.9,0.4,0.05);
        vec3 purple=vec3(0.4,0.15,0.7);

        vec3 col=dark;
        float ring=smoothstep(0.55,0.45,dist)*smoothstep(0.3,0.5,dist);
        col=mix(col,orange*(0.4+spinPulse*0.6),ring*n*0.8);
        col=mix(col,purple*0.3,smoothstep(0.5,0.0,dist)*n*0.4);
        col+=orange*(0.05+spinPulse*0.15)*smoothstep(0.5,0.0,dist);

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
    const start = performance.now();

    const render = () => {
      const t = (performance.now() - start) / 1000;
      const spinVal = isSpinning ? 1.0 : 0.0;
      gl.uniform1f(uTime, t);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uSpin, spinVal);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      bgRafRef.current = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(bgRafRef.current);
      ro.disconnect();
    };
  }, [isSpinning]);

  // ── Draw pie wheel ──────────────────────────────────────────────────────────
  const drawWheel = useCallback((angle: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const size = canvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 8;

    ctx.clearRect(0, 0, size, size);

    if (segments.length === 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = "oklch(0.25 0.03 260)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "oklch(0.16 0.025 260)";
      ctx.fill();
      ctx.fillStyle = "oklch(0.55 0.02 260)";
      ctx.font = `bold 14px 'Syne', sans-serif`;
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

      // Label
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(mid);
      const labelR = r * 0.62;
      ctx.translate(labelR, 0);
      ctx.rotate(-mid);

      const maxWidth = r * 0.5;
      const fontSize = segments.length > 10 ? 10 : segments.length > 7 ? 11 : 13;
      ctx.font = `600 ${fontSize}px 'DM Sans', sans-serif`;
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 4;

      // Truncate label if needed
      let label = seg.label;
      while (ctx.measureText(label).width > maxWidth && label.length > 3) {
        label = label.slice(0, -1);
      }
      if (label !== seg.label) label = label.slice(0, -1) + "…";
      ctx.fillText(label, 0, 0);
      ctx.restore();
    });

    // Center circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    const centerGrd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 22);
    centerGrd.addColorStop(0, "#1a1a2e");
    centerGrd.addColorStop(1, "#0d0d1a");
    ctx.fillStyle = centerGrd;
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // Outer ring glow
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }, [segments]);

  // Sync canvas size
  useEffect(() => {
    const canvas = canvasRef.current;
    const bg = bgCanvasRef.current;
    if (!canvas || !bg) return;
    const size = Math.min(canvas.parentElement?.clientWidth ?? 400, 500);
    canvas.width = size;
    canvas.height = size;
    drawWheel(currentAngleRef.current);
  }, [segments, drawWheel]);

  useEffect(() => {
    drawWheel(displayAngle);
  }, [displayAngle, drawWheel]);

  // Spin animation
  useEffect(() => {
    if (!isSpinning || segments.length === 0) return;

    // Derive the landing angle from the *current* resting angle so the wheel
    // always stops on segments[targetIdx] — the value we record and display.
    // When the server chose a winner (targetId), animate to that segment.
    const forcedIdx = targetId != null ? segments.findIndex((s) => s.id === targetId) : -1;
    const { targetIdx, targetAngle } = computeSpin({
      count: segments.length,
      currentAngle: currentAngleRef.current,
      minRotations: MIN_ROTATIONS,
      targetIdx: forcedIdx >= 0 ? forcedIdx : undefined,
    });

    startAngleRef.current = currentAngleRef.current;
    targetAngleRef.current = targetAngle;
    startTimeRef.current = performance.now();

    const animate = () => {
      const elapsed = performance.now() - startTimeRef.current;
      const progress = Math.min(elapsed / SPIN_DURATION, 1);
      const eased = EASE_OUT(progress);
      const angle = startAngleRef.current + (targetAngleRef.current - startAngleRef.current) * eased;
      currentAngleRef.current = angle;
      setDisplayAngle(angle);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        currentAngleRef.current = targetAngleRef.current;
        setDisplayAngle(targetAngleRef.current);
        onSpinEnd(segments[targetIdx]!);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isSpinning, segments, onSpinEnd, targetId]);

  const size = 400;

  return (
    <div className="relative flex items-center justify-center" style={{ width: "100%", maxWidth: 500 }}>
      {/* WebGL background glow */}
      <canvas
        ref={bgCanvasRef}
        className="absolute rounded-full"
        style={{ width: "100%", height: "100%", maxWidth: 500, maxHeight: 500 }}
      />

      {/* Pointer arrow */}
      <div
        className="absolute z-20 top-0 left-1/2 -translate-x-1/2 -translate-y-1"
        style={{ filter: "drop-shadow(0 0 8px oklch(0.72 0.22 30))" }}
      >
        <svg width="24" height="32" viewBox="0 0 24 32" fill="none">
          <path d="M12 2L22 22H2L12 2Z" fill="oklch(0.72 0.22 30)" stroke="white" strokeWidth="1.5" />
        </svg>
      </div>

      {/* Pie wheel canvas */}
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="relative z-10 rounded-full"
        style={{ width: "100%", maxWidth: 500 }}
      />
    </div>
  );
}
