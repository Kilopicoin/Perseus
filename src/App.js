import React, { useMemo, useState, useRef, useEffect } from "react";
import "./App.css";

/** ---------- Config ---------- */
const GRID_SIZE = 100;                // full logical grid: 100x100
const VISIBLE_SIZE = 11;              // keep the center 11x11 visible

// 🔒 Lock the on-screen scale to what you had before (20x20 view sizing)
// This keeps tile size / zoom identical to your current app.
const SIZING_GRID = 20;               // used for scaling only

const TILE_W = 96;                    // tile width
const TILE_H = 48;                    // tile height (isometric diamond)
const PLANET_DENSITY = 0.18;          // ~18% of tiles get planets
const SEED_DEFAULT = 1337;

/** ---------- Utilities ---------- */
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoPos(row, col) {
  const x = (col - row) * (TILE_W / 2);
  const y = (col + row) * (TILE_H / 2);
  return { x, y };
}

function tilePath() {
  const w2 = TILE_W / 2;
  const h = TILE_H / 2;
  return `M 0 ${-h} L ${w2} 0 L 0 ${h} L ${-w2} 0 Z`;
}

/** Planet palette & renderers (pure SVG) */
const PLANET_TYPES = ["terran", "desert", "ice", "lava", "gas", "metallic"];

function planetDefs() {
  return (
    <defs>
      <filter id="glow" x="-30%" y="-30%" width="160%" height="160%" filterUnits="objectBoundingBox">
        <feGaussianBlur stdDeviation="6" result="coloredBlur" />
        <feMerge>
          <feMergeNode in="coloredBlur" />
        </feMerge>
      </filter>

      <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%" filterUnits="objectBoundingBox">
        <feDropShadow dx="0" dy="1.2" stdDeviation="1.4" floodOpacity="0.35" />
      </filter>

      <radialGradient id="grad-terran" cx="35%" cy="35%" r="70%">
        <stop offset="0%" stopColor="#c8ffe6" />
        <stop offset="45%" stopColor="#2b9aa0" />
        <stop offset="100%" stopColor="#0b3450" />
      </radialGradient>

      <radialGradient id="grad-desert" cx="35%" cy="35%" r="70%">
        <stop offset="0%" stopColor="#fff2c5" />
        <stop offset="50%" stopColor="#e0a34c" />
        <stop offset="100%" stopColor="#8b4a1f" />
      </radialGradient>

      <radialGradient id="grad-ice" cx="35%" cy="35%" r="70%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="55%" stopColor="#a8e8ff" />
        <stop offset="100%" stopColor="#3a6ea8" />
      </radialGradient>

      <radialGradient id="grad-lava" cx="40%" cy="40%" r="70%">
        <stop offset="0%" stopColor="#fff0a8" />
        <stop offset="50%" stopColor="#ff6b3d" />
        <stop offset="100%" stopColor="#6b0b0b" />
      </radialGradient>

      <radialGradient id="grad-metal" cx="35%" cy="35%" r="70%">
        <stop offset="0%" stopColor="#f2f2f2" />
        <stop offset="60%" stopColor="#9aa3ad" />
        <stop offset="100%" stopColor="#3e4750" />
      </radialGradient>

      <pattern id="gas-bands" width="12" height="12" patternUnits="userSpaceOnUse">
        <rect width="12" height="12" fill="#7a5ea8" />
        <rect y="3" width="12" height="3" fill="#a08ad1" opacity="0.9" />
        <rect y="8" width="12" height="2.8" fill="#5b3f8f" opacity="0.9" />
      </pattern>
      <radialGradient id="grad-gas" cx="35%" cy="35%" r="70%">
        <stop offset="0%" stopColor="#d9c9ff" />
        <stop offset="60%" stopColor="#b39ce6" />
        <stop offset="100%" stopColor="#5b3f8f" />
      </radialGradient>

      <radialGradient id="nebulaPurple" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#b46cff" stopOpacity="0.55" />
        <stop offset="100%" stopColor="#301146" stopOpacity="0" />
      </radialGradient>

      <filter id="spaceCloud" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="7" result="f"/>
        <feColorMatrix type="saturate" values="0.4"/>
        <feComponentTransfer>
          <feFuncA type="gamma" amplitude="0.9" exponent="1.6" offset="-0.15" />
        </feComponentTransfer>
        <feGaussianBlur stdDeviation="2"/>
      </filter>
    </defs>
  );
}

function Planet({ type, r = 18 }) {
  const stroke = "rgba(255,255,255,0.35)";

  if (type === "gas") {
    return (
      <g filter="url(#shadow)">
        <circle r={r} fill="url(#grad-gas)" />
        <circle r={r - 1} fill="url(#gas-bands)" opacity="0.9" clipPath={`inset(0 round ${r}px)`} />
        <ellipse rx={r + 10} ry={r / 2.3} fill="none" stroke="#cbb7ff" strokeOpacity="0.7" strokeWidth="2" transform="rotate(-18)" />
        <circle r={r} fill="transparent" stroke={stroke} strokeWidth="0.8" />
      </g>
    );
  }

  const fillId =
    type === "terran" ? "url(#grad-terran)" :
    type === "desert" ? "url(#grad-desert)" :
    type === "ice" ? "url(#grad-ice)" :
    type === "lava" ? "url(#grad-lava)" :
    "url(#grad-metal)";

  return (
    <g filter="url(#shadow)">
      <circle r={r} fill={fillId} />
      <circle r={r} fill="none" stroke={stroke} strokeWidth="0.8" />
      <circle cx="-7" cy="-7" r={r*0.45} fill="white" opacity="0.12" />
    </g>
  );
}

/** ---------- Galaxy generation ---------- */
function useGalaxy(seed) {
  const rnd = useMemo(() => mulberry32(seed), [seed]);

  const tiles = useMemo(() => {
    const list = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const { x, y } = isoPos(r, c);
        list.push({ id: `${r}-${c}`, r, c, x, y });
      }
    }
    return list;
  }, []);

  const planets = useMemo(() => {
    const p = [];
    const total = GRID_SIZE * GRID_SIZE;
    const count = Math.max(8, Math.floor(total * PLANET_DENSITY));
    const used = new Set();
    while (p.length < count) {
      const r = Math.floor(rnd() * GRID_SIZE);
      const c = Math.floor(rnd() * GRID_SIZE);
      const key = `${r}-${c}`;
      if (used.has(key)) continue;
      used.add(key);
      const type = PLANET_TYPES[Math.floor(rnd() * PLANET_TYPES.length)];
      p.push({ key, r, c, type });
    }
    return p;
  }, [rnd]);

  // Calculate viewBox centered on visible 11x11 area
  const VISIBLE_START = Math.floor((GRID_SIZE - VISIBLE_SIZE) / 2);
  const VISIBLE_END = VISIBLE_START + VISIBLE_SIZE - 1;
  const centerRow = (VISIBLE_START + VISIBLE_END) / 2;
  const centerCol = (VISIBLE_START + VISIBLE_END) / 2;
  const { x: centerX, y: centerY } = isoPos(centerRow, centerCol);

  const width = SIZING_GRID * TILE_W;
  const height = SIZING_GRID * TILE_H;
  const minX = centerX - width / 2;
  const minY = centerY - height / 2;

  return { tiles, planets, viewBox: `${minX} ${minY} ${width} ${height}`, bounds: { minX, minY, width, height }, VISIBLE_START, VISIBLE_END };
}

function isVisibleRC(r, c, VISIBLE_START, VISIBLE_END) {
  return r >= VISIBLE_START && r <= VISIBLE_END && c >= VISIBLE_START && c <= VISIBLE_END;
}

/** ---------- App ---------- */
export default function App() {
  const [seed, setSeed] = useState(SEED_DEFAULT);
  const { tiles, planets, viewBox, bounds, VISIBLE_START, VISIBLE_END } = useGalaxy(seed);

  const tilePoly = useMemo(() => tilePath(), []);
  const planetByCell = useMemo(() => {
    const map = new Map();
    planets.forEach(p => map.set(`${p.r}-${p.c}`, p));
    return map;
  }, [planets]);

  const defs = useMemo(() => planetDefs(), []);

  const svgRef = useRef(null);
  const hoverRef = useRef(null);

  useEffect(() => {
    const svg = svgRef.current;
    const hover = hoverRef.current;
    if (!svg || !hover) return;

    let raf = 0;
    const onMove = (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const g = e.target.closest('g[data-x][data-y]');
        if (g) {
          hover.style.display = 'block';
          hover.setAttribute('transform', `translate(${g.dataset.x}, ${g.dataset.y})`);
        } else {
          hover.style.display = 'none';
        }
      });
    };
    const onLeave = () => { hover.style.display = 'none'; };

    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerleave', onLeave);
    return () => {
      svg.removeEventListener('pointermove', onMove);
      svg.removeEventListener('pointerleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="app">
      <div className="hud">
        <h1>Stellar Tactics – Grid Template</h1>
        <div className="controls">
          <button onClick={() => setSeed(Math.floor(Math.random() * 1e9))}>Randomize</button>
          <button onClick={() => setSeed(SEED_DEFAULT)}>Reset</button>
        </div>
      </div>

      <div className="space-bg" />
      <div className="space-stars" />

      <svg ref={svgRef} className="scene" viewBox={viewBox} role="img" aria-label="isometric space grid">
        {defs}

        <g opacity="0.8" filter="url(#glow)">
          <circle cx={0} cy={0} r={220} fill="url(#nebulaPurple)" />
        </g>

        <mask id="mask-cloud-outside">
          <rect x="-99999" y="-99999" width="199999" height="199999" fill="white" />
          <g transform="translate(0,0)">
            {tiles.map(t => {
              if (!isVisibleRC(t.r, t.c, VISIBLE_START, VISIBLE_END)) return null;
              return (
                <g key={`hole-${t.id}`} transform={`translate(${t.x}, ${t.y})`}>
                  <path d={tilePoly} fill="black" />
                </g>
              );
            })}
          </g>
        </mask>

        <g className="grid">
          {tiles.map(t => {
            const outer = !isVisibleRC(t.r, t.c, VISIBLE_START, VISIBLE_END);
            return (
              <g
                key={t.id}
                data-x={t.x}
                data-y={t.y}
                transform={`translate(${t.x}, ${t.y})`}
                className={outer ? "outer" : ""}
              >
                <path d={tilePoly} className="tile" />
              </g>
            );
          })}
        </g>

        <g className="planets">
          {tiles.map(t => {
            const p = planetByCell.get(t.id);
            if (!p) return null;
            return (
              <g key={`p-${t.id}`} transform={`translate(${t.x}, ${t.y})`}>
                <g transform={`translate(0, -6)`}>
                  <Planet type={p.type} r={18} />
                </g>
              </g>
            );
          })}
        </g>

        <g className="cloud-overlay" mask="url(#mask-cloud-outside)">
          <rect
            x={bounds.minX - 200}
            y={bounds.minY - 200}
            width={bounds.width + 400}
            height={bounds.height + 400}
            filter="url(#spaceCloud)"
            opacity="0.9"
          />
          <g opacity="0.35" filter="url(#glow)">
            <circle cx="0" cy="0" r={1200} fill="url(#nebulaPurple)" />
          </g>
        </g>

        <path
          ref={hoverRef}
          d={tilePoly}
          className="tile-hover-outline"
          style={{ display: 'none' }}
        />
      </svg>

      <footer className="legend">
        <div className="badge terran">Terran</div>
        <div className="badge desert">Desert</div>
        <div className="badge ice">Ice</div>
        <div className="badge lava">Lava</div>
        <div className="badge gas">Gas Giant</div>
        <div className="badge metallic">Metallic</div>
      </footer>
    </div>
  );
}
