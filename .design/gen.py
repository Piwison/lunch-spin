HEAD = '''<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700&display=swap">
  <style>
    body { margin: 0; font-family: "Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif; }
    a { color: #b0431a; } a:hover { color: #de5c1f; }
    * { box-sizing: border-box; }
  </style>
</helmet>
'''

HELPERS = '''  tokens(dark) {
    return dark ? {
      ground: "linear-gradient(160deg,#191b20 0%,#15171c 55%,#101216 100%)",
      paper: "#1e2127", ink: "#f6f3ee", inkStrong: "#fcfaf7", body: "#e6e2db",
      muted: "#9ba0a8", faint: "#7c838c", hairline: "#2e323a",
      brand: "#f2703a", accentInk: "#f2703a", onAccent: "#16120f",
      paneA: "rgb(255 255 255 / 0.12)", paneB: "rgb(255 255 255 / 0.06)",
      wheelHair: "rgb(0 0 0 / 0.3)", shadow: "0 24px 60px rgb(0 0 0 / 0.5)",
      glassBg: "rgb(255 255 255 / 0.08)", glassBorder: "rgb(255 255 255 / 0.12)",
      highlight: "linear-gradient(135deg,rgb(255 255 255 / .10),rgb(255 255 255 / 0) 42%,rgb(242 112 58 / .12))",
      win: "rgb(242 112 58 / 0.30)", winEdge: "rgb(242 112 58 / 0.85)",
      rowHover: "rgb(255 255 255 / 0.04)"
    } : {
      ground: "linear-gradient(160deg,#f6f2ec 0%,#efe8df 55%,#e7ded2 100%)",
      paper: "#fbf7f2", ink: "#14161c", inkStrong: "#0d0f14", body: "#5a626d",
      muted: "#868d97", faint: "#9aa1aa", hairline: "#c7cbd1",
      brand: "#de5c1f", accentInk: "#b0431a", onAccent: "#fbf7f2",
      paneA: "rgb(255 255 255 / 0.78)", paneB: "rgb(255 255 255 / 0.40)",
      wheelHair: "rgb(20 22 28 / 0.1)", shadow: "0 24px 60px rgb(20 22 28 / 0.18)",
      glassBg: "rgb(255 255 255 / 0.62)", glassBorder: "rgb(255 255 255 / 0.95)",
      highlight: "linear-gradient(135deg,rgb(255 255 255 / .55),rgb(255 255 255 / 0) 42%,rgb(222 92 31 / .07))",
      win: "rgb(222 92 31 / 0.22)", winEdge: "rgb(222 92 31 / 0.75)",
      rowHover: "rgb(255 255 255 / 0.5)"
    };
  }
  base() {
    const NAMES = ["Nonna's Trattoria","Sichuan House","Green Bowl","Tacos El Sol",
      "Sakura Ramen","The Daily Grind","Falafel Corner","Bombay Kitchen",
      "Pho 88","Smokehouse Six","Olive & Vine","Banh Mi Bros"];
    const count = Number(this.props.count ?? 12);
    const dark = !!this.props.dark;
    const t = this.tokens(dark);
    const names = NAMES.slice(0, count);
    const sweep = 360 / count;
    const stops = [];
    for (let i = 0; i < count; i++) {
      const heavy = (count % 2 === 1 && i === count - 1) ? false : i % 2 === 0;
      stops.push((heavy ? t.paneA : t.paneB) + " " + (i * sweep) + "deg " + ((i + 1) * sweep) + "deg");
    }
    const POINTER = 180;
    // Which pane currently sits under the pointer.
    let at = 0, best = 1e9;
    for (let i = 0; i < count; i++) {
      const c = i * sweep + sweep / 2;
      const d = Math.abs(((c - POINTER + 540) % 360) - 180);
      if (d < best) { best = d; at = i; }
    }
    return {
      count, dark, t, names, sweep, at,
      conic: "conic-gradient(from 90deg," + stops.join(",") + ")",
      hair: "repeating-conic-gradient(from 90deg," + t.wheelHair + " 0deg 0.35deg,transparent 0.35deg " + sweep + "deg)",
      DISC: 414, CX: 210
    };
  }
'''

def build(name, template, rendervals, props='{"count":{"editor":"enum","options":[8,12],"default":12,"section":"Wheel"},"dark":{"editor":"boolean","default":false,"section":"Wheel"}}'):
    src = HEAD + template + "</x-dc>\n<script data-dc-script data-props='" + props + "'>\nclass Component extends DCLogic {\n" + HELPERS + rendervals + "}\n</script>\n</body>\n</html>\n"
    open(name, "w").write(src)
    print("wrote", name, len(src), "bytes")

SHELL_OPEN = '''<div style="width: 390px; min-height: 760px; background: {{bg}}; position: relative; overflow: hidden; display: flex; flex-direction: column;">
  <div style="display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid {{hair}};">
    <div style="display: flex; align-items: center; gap: 9px;">
      <div style="width: 22px; height: 22px; border-radius: 999px; background: {{conic}};"></div>
      <span style="font-size: 15px; font-weight: 600; letter-spacing: -0.02em; color: {{ink}};">Tuesday Crew</span>
    </div>
    <span style="font-size: 11px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: {{muted}};">{{count}} in play</span>
  </div>
'''

SPIN = '''  <div style="padding: 0 16px 24px; margin-top: auto;">
    <div style="display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 56px; border-radius: 22px; background: {{brand}}; color: {{onAccent}}; font-size: 17px; font-weight: 600;">Spin the wheel</div>
  </div>
</div>
'''

DISC = '''    <div style="position: absolute; left: 3px; top: 0; width: 414px; height: 414px; border-radius: 999px; background-image: {{hair}}, {{conic}}; box-shadow: {{shadow}}, inset 0 0 0 1px {{glassBorder}};"></div>
    <div style="position: absolute; left: 3px; top: 0; width: 414px; height: 414px; border-radius: 999px; background-image: {{highlight}};"></div>
'''

WIN = '''    <div style="position: absolute; left: 3px; top: 0; width: 414px; height: 414px; border-radius: 999px; background-image: {{winConic}};"></div>
'''

POINTER = '''    <div style="position: absolute; left: 3px; top: 175px; width: 82px; height: 64px; background: linear-gradient(90deg, {{sense}}, transparent); border-radius: 0 999px 999px 0;"></div>
    <div style="position: absolute; left: 6px; top: 194px; width: 0; height: 0; border-top: 13px solid transparent; border-bottom: 13px solid transparent; border-left: 22px solid {{brand}};"></div>
'''

HUB = '''    <div style="position: absolute; left: 156px; top: 153px; width: 108px; height: 108px; border-radius: 999px; background: {{glassBg}}; border: 1px solid {{glassBorder}}; backdrop-filter: blur(24px); display: flex; flex-direction: column; align-items: center; justify-content: center;">
      <span style="font-size: 40px; font-weight: 600; letter-spacing: -0.04em; line-height: 1; color: {{inkStrong}};">{{count}}</span>
      <span style="font-size: 11px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; margin-top: 5px; color: {{brand}};">in play</span>
    </div>
'''

COMMON_VALS = '''    const b = this.base();
    const t = b.t;
    const winStart = b.at * b.sweep, winEnd = winStart + b.sweep;
    const v = {
      count: b.count, bg: t.ground, ink: t.ink, inkStrong: t.inkStrong, body: t.body,
      muted: t.muted, faint: t.faint, hair: t.hairline, brand: t.brand,
      accentInk: t.accentInk, onAccent: t.onAccent, paper: t.paper,
      conic: b.conic, hairConic: b.hair, shadow: t.shadow, highlight: t.highlight,
      glassBg: t.glassBg, glassBorder: t.glassBorder,
      sense: b.dark ? "rgb(242 112 58 / 0.22)" : "rgb(222 92 31 / 0.18)",
      winConic: "conic-gradient(from 90deg,transparent 0deg " + winStart + "deg," + t.winEdge + " " + winStart + "deg " + (winStart + 0.6) + "deg," + t.win + " " + (winStart + 0.6) + "deg " + (winEnd - 0.6) + "deg," + t.winEdge + " " + (winEnd - 0.6) + "deg " + winEnd + "deg,transparent " + winEnd + "deg 360deg)",
      atName: b.names[b.at]
    };
'''

# ─── A · Numbered wheel + legend ───────────────────────────────────────────
A_TPL = SHELL_OPEN + '''  <div style="position: relative; width: 390px; height: 372px; overflow: hidden;">
''' + DISC + WIN + '''    <sc-for list="{{marks}}" as="m" hint-placeholder-count="12">
      <div style="{{m.style}}">
        <span style="{{m.textStyle}}">{{m.n}}</span>
      </div>
    </sc-for>
''' + HUB + POINTER + '''  </div>
  <div style="padding: 18px 16px 0;">
    <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: {{muted}}; margin-bottom: 12px;">On the wheel</div>
    <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 14px;">
      <sc-for list="{{legend}}" as="row" hint-placeholder-count="12">
        <div style="display: flex; align-items: center; gap: 9px; min-width: 0;">
          <span style="{{row.badge}}">{{row.n}}</span>
          <span style="{{row.label}}">{{row.name}}</span>
        </div>
      </sc-for>
    </div>
  </div>
''' + SPIN

A_VALS = '''  renderVals() {
''' + COMMON_VALS + '''    const R = 207, ring = R * 0.7;
    v.marks = b.names.map((n, i) => {
      const deg = i * b.sweep + b.sweep / 2, rad = deg * Math.PI / 180;
      const x = 3 + R + ring * Math.cos(rad), y = R + ring * Math.sin(rad);
      const on = i === b.at;
      return {
        n: i + 1,
        style: "position:absolute;left:" + (x - 19) + "px;top:" + (y - 19) + "px;width:38px;height:38px;border-radius:999px;display:flex;align-items:center;justify-content:center;" + (on ? "background:" + t.brand + ";" : "border:1px solid " + t.hairline + ";"),
        textStyle: "font-size:17px;font-weight:600;letter-spacing:-0.02em;color:" + (on ? t.onAccent : t.ink) + ";"
      };
    });
    v.legend = b.names.map((n, i) => ({
      n: i + 1, name: n,
      badge: "flex:none;width:20px;height:20px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;" + (i === b.at ? "background:" + t.brand + ";color:" + t.onAccent + ";" : "background:" + t.glassBg + ";border:1px solid " + t.hairline + ";color:" + t.muted + ";"),
      label: "font-size:15px;font-weight:" + (i === b.at ? "600" : "400") + ";letter-spacing:-0.01em;color:" + (i === b.at ? t.ink : t.body) + ";white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
    }));
    return v;
  }
'''
build("OptionA-Numbered.dc.html", A_TPL, A_VALS)

# ─── B · Pointer-only naming ───────────────────────────────────────────────
B_TPL = SHELL_OPEN + '''  <div style="padding: 26px 16px 6px;">
    <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: {{brand}}; margin-bottom: 8px;">At the pointer</div>
    <div style="font-size: 34px; font-weight: 600; line-height: 1; letter-spacing: -0.035em; color: {{accentInk}}; text-wrap: balance;">{{atName}}</div>
  </div>
  <div style="position: relative; width: 390px; height: 424px; overflow: hidden;">
''' + DISC + WIN + HUB + POINTER + '''  </div>
''' + SPIN

B_VALS = '''  renderVals() {
''' + COMMON_VALS + '''    return v;
  }
'''
build("OptionB-Pointer.dc.html", B_TPL, B_VALS)

# ─── C · Radial labels ─────────────────────────────────────────────────────
C_TPL = SHELL_OPEN + '''  <div style="position: relative; width: 390px; height: 448px; overflow: hidden;">
''' + DISC + WIN + '''    <sc-for list="{{spokes}}" as="s" hint-placeholder-count="12">
      <div style="{{s.wrap}}">
        <span style="{{s.text}}">{{s.name}}</span>
      </div>
    </sc-for>
''' + HUB + POINTER + '''  </div>
''' + SPIN

C_VALS = '''  renderVals() {
''' + COMMON_VALS + '''    const R = 207, inner = 60, outer = R - 16;
    v.spokes = b.names.map((n, i) => {
      const deg = i * b.sweep + b.sweep / 2;
      const flip = deg > 90 && deg < 270;
      const on = i === b.at;
      return {
        name: n,
        wrap: "position:absolute;left:" + (3 + R) + "px;top:" + R + "px;width:0;height:0;transform:rotate(" + (flip ? deg + 180 : deg) + "deg);",
        text: "position:absolute;" + (flip ? "right:" + inner + "px;text-align:right;" : "left:" + inner + "px;text-align:left;") +
          "top:-9px;width:" + (outer - inner) + "px;font-size:13px;font-weight:700;letter-spacing:-0.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:" + (on ? t.accentInk : t.ink) + ";" +
          (flip ? "direction:rtl;" : "")
      };
    });
    return v;
  }
'''
build("OptionC-Radial.dc.html", C_TPL, C_VALS)

# ─── D · Arc + list ────────────────────────────────────────────────────────
D_TPL = SHELL_OPEN + '''  <div style="position: relative; flex: 1; min-height: 0;">
    <div style="position: absolute; right: -286px; top: 8px; width: 480px; height: 480px; border-radius: 999px; background-image: {{hairConic}}, {{conic}}; box-shadow: {{shadow}}, inset 0 0 0 1px {{glassBorder}};"></div>
    <div style="position: absolute; right: -286px; top: 8px; width: 480px; height: 480px; border-radius: 999px; background-image: {{arcWin}};"></div>
    <div style="position: absolute; right: 176px; top: 236px; width: 0; height: 0; border-top: 12px solid transparent; border-bottom: 12px solid transparent; border-right: 20px solid {{brand}};"></div>
    <div style="position: relative; padding: 20px 16px 0; width: 232px;">
      <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: {{muted}}; margin-bottom: 14px;">In play today</div>
      <div style="display: flex; flex-direction: column; gap: 2px;">
        <sc-for list="{{rows}}" as="row" hint-placeholder-count="12">
          <div style="{{row.wrap}}">
            <span style="{{row.dot}}"></span>
            <span style="{{row.label}}">{{row.name}}</span>
          </div>
        </sc-for>
      </div>
    </div>
  </div>
''' + SPIN

D_VALS = '''  renderVals() {
''' + COMMON_VALS + '''    const ws = b.at * b.sweep, we = ws + b.sweep;
    v.arcWin = "conic-gradient(from 90deg,transparent 0deg " + ws + "deg," + t.winEdge + " " + ws + "deg " + (ws + 0.6) + "deg," + t.win + " " + (ws + 0.6) + "deg " + (we - 0.6) + "deg," + t.winEdge + " " + (we - 0.6) + "deg " + we + "deg,transparent " + we + "deg 360deg)";
    v.rows = b.names.map((n, i) => {
      const on = i === b.at;
      return {
        name: n,
        wrap: "display:flex;align-items:center;gap:10px;min-height:34px;padding:0 10px;border-radius:10px;min-width:0;" + (on ? "background:" + t.glassBg + ";border:1px solid " + t.glassBorder + ";" : ""),
        dot: "flex:none;width:6px;height:6px;border-radius:999px;background:" + (on ? t.brand : t.faint) + ";",
        label: "font-size:16px;font-weight:" + (on ? "600" : "400") + ";letter-spacing:-0.015em;color:" + (on ? t.ink : t.body) + ";white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
      };
    });
    return v;
  }
'''
build("OptionD-ArcList.dc.html", D_TPL, D_VALS)

# ─── Main · the current build, for comparison ──────────────────────────────
M_TPL = SHELL_OPEN + '''  <div style="position: relative; width: 390px; height: 448px; overflow: hidden;">
''' + DISC + WIN + '''    <sc-for list="{{flat}}" as="f" hint-placeholder-count="12">
      <span style="{{f.style}}">{{f.name}}</span>
    </sc-for>
''' + HUB + POINTER + '''  </div>
  <div style="padding: 14px 16px 0;">
    <div style="font-size: 13px; line-height: 1.45; color: {{muted}};">Current build. Horizontal labels, staggered onto two rings from nine places up. Worst case 66px at twelve — about eight characters.</div>
  </div>
''' + SPIN

M_VALS = '''  renderVals() {
''' + COMMON_VALS + '''    const R = 207, stag = b.count >= 9;
    const anchors = b.names.map((n, i) => {
      const deg = i * b.sweep + b.sweep / 2, rad = deg * Math.PI / 180;
      const ratio = stag ? (i % 2 === 0 ? 0.81 : 0.49) : 0.62;
      const r = R * ratio;
      return { i, name: n, x: r * Math.cos(rad), y: r * Math.sin(rad), r };
    });
    v.flat = anchors.map((a) => {
      const rimHalf = Math.sqrt(Math.max(0, (R - 6) * (R - 6) - a.y * a.y));
      const absX = 210 + a.x;
      let left = Math.min(a.x + rimHalf, absX - 8);
      let right = Math.min(rimHalf - a.x, 390 - 8 - absX);
      for (const q of anchors) {
        if (q.i === a.i || Math.abs(a.y - q.y) >= 18) continue;
        const gap = (Math.abs(a.x - q.x) - 12) / 2;
        if (q.x < a.x) left = Math.min(left, gap); else right = Math.min(right, gap);
      }
      if (Math.abs(a.y) < 54) {
        const hc = Math.sqrt(54 * 54 - a.y * a.y);
        if (a.x >= 0) left = Math.min(left, a.x - hc - 8); else right = Math.min(right, -a.x - hc - 8);
      }
      left = Math.max(0, left); right = Math.max(0, right);
      const w = Math.max(0, Math.min(left + right, 4 * a.r * Math.sin(Math.PI / b.count)));
      const cxb = 3 + R + a.x + (right - left) / 2;
      return {
        name: a.name,
        style: "position:absolute;left:" + (cxb - w / 2) + "px;top:" + (R + a.y - 10) + "px;width:" + w + "px;text-align:center;font-size:" + (b.count <= 8 ? 15 : 13) + "px;font-weight:700;letter-spacing:-0.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:" + (a.i === b.at ? t.accentInk : t.ink) + ";"
      };
    });
    return v;
  }
'''
build("Main.dc.html", M_TPL, M_VALS)
