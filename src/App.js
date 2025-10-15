import React, { useMemo, useState } from "react";
import "./App.css";

/** ---------- Config ---------- */
const GRID_SIZE = 11;                 // 11x11
const TILE_W = 96;                    // tile width
const TILE_H = 48;                    // tile height (isometric diamond)
const PLANET_DENSITY = 0.18;          // ~18% of tiles get planets
const SEED_DEFAULT = 1337;

/** ---------- Utilities ---------- */
function mulberry32(a) {
  // tiny seeded PRNG for repeatable randomness
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoPos(row, col) {
  // classic isometric (diamond) projection
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
const PLANET_TYPES = [
  "terran",
  "desert",
  "ice",
  "lava",
  "gas",
  "metallic",
];

function planetDefs() {
  // gradients, glows, etc.
  return (
    <defs>
      {/* soft stars glow */}
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="6" result="coloredBlur" />
        <feMerge>
          <feMergeNode in="coloredBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      {/* drop shadow for planets */}
      <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.5" />
      </filter>

      {/* planet gradient styles */}
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

      {/* gas giant banding */}
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

      {/* nebula blobs */}
      <radialGradient id="nebulaPurple" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#b46cff" stopOpacity="0.55" />
        <stop offset="100%" stopColor="#301146" stopOpacity="0" />
      </radialGradient>
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
        {/* ring */}
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

/** ---------- Planet placement ---------- */
function useGalaxy(seed) {
  const rnd = useMemo(() => mulberry32(seed), [seed]);

  // grid tiles
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

  // choose random tiles for planets
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

  // ViewBox bounds
  const minX = (-(GRID_SIZE - 1) * (TILE_W / 2)) - TILE_W;
  const maxX = ((GRID_SIZE - 1) * (TILE_W / 2)) + TILE_W;
  const minY = 0 - TILE_H;
  const maxY = (GRID_SIZE - 1 + GRID_SIZE - 1) * (TILE_H / 2) + TILE_H;

  return { tiles, planets, viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}` };
}

/** ---------- App ---------- */
export default function App() {
  const [seed, setSeed] = useState(SEED_DEFAULT);
  const { tiles, planets, viewBox } = useGalaxy(seed);

  const tilePoly = useMemo(() => tilePath(), []);
  const planetByCell = useMemo(() => {
    const map = new Map();
    planets.forEach(p => map.set(`${p.r}-${p.c}`, p));
    return map;
  }, [planets]);

  return (
    <div className="app">
      <div className="hud">
        <h1>Stellar Tactics – Grid Template</h1>
        <div className="controls">
          <button onClick={() => setSeed(Math.floor(Math.random() * 1e9))}>Randomize</button>
          <button onClick={() => setSeed(SEED_DEFAULT)}>Reset</button>
        </div>
      </div>

      {/* starfield background layers */}
      <div className="space-bg" />
      <div className="space-stars" />

      <svg className="scene" viewBox={viewBox} role="img" aria-label="isometric space grid">
        {planetDefs()}

        {/* subtle purple nebula on the right (like the reference) */}
        <g opacity="0.8" filter="url(#glow)">
          <circle cx={(GRID_SIZE * TILE_W)} cy={(GRID_SIZE * TILE_H) / 2} r={220} fill="url(#nebulaPurple)" />
          <circle cx={(GRID_SIZE * TILE_W) * 0.9} cy={(GRID_SIZE * TILE_H) * 0.3} r={160} fill="url(#nebulaPurple)" />
          <circle cx={(GRID_SIZE * TILE_W) * 0.95} cy={(GRID_SIZE * TILE_H) * 0.7} r={130} fill="url(#nebulaPurple)" />
        </g>

        {/* grid */}
        <g className="grid">
          {tiles.map(t => (
            <g key={t.id} transform={`translate(${t.x}, ${t.y})`}>
              <path d={tilePoly} className="tile" />
              {/* hover highlight ring */}
              <path d={tilePoly} className="tile-outline" />
            </g>
          ))}
        </g>

        {/* planets (centered inside their tiles) */}
        <g className="planets">
          {tiles.map(t => {
            const p = planetByCell.get(t.id);
            if (!p) return null;
            return (
              <g key={`p-${t.id}`} transform={`translate(${t.x}, ${t.y})`}>
                {/* raise a bit visually to sit "on top" of the tile */}
                <g transform={`translate(0, -6)`}>
                  <Planet type={p.type} r={18} />
                </g>
              </g>
            );
          })}
        </g>
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
