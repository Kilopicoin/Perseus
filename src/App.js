import React, { useMemo, useState, useRef, useEffect } from "react";
import "./App.css";
import { formatEther } from "ethers";
import { getContractMain, getSignerContractMain } from "./contracts/contractMain";

/** ---------- Config ---------- */
const GRID_SIZE = 100;                // full logical grid: 100x100
const VISIBLE_SIZE = 11;              // render only this window (centered)

// 🔒 Lock the on-screen scale to what you had before (20x20 view sizing)
const SIZING_GRID = 20;               // used for scaling only

const TILE_W = 96;                    // tile width
const TILE_H = 48;                    // tile height (isometric diamond)
const SEED_DEFAULT = 1337;

/** ---------- Utilities ---------- */
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

// ⬇️ planet + nebula defs (nebula seeded for deterministic background)
function planetDefs(nebulaSeed) {
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

      {/* ---- World nebula (background) ---- */}
      <radialGradient id="nebula-colors" cx="55%" cy="45%" r="85%">
        <stop offset="0%"  stopColor="#c8a6ff" />
        <stop offset="35%" stopColor="#8b6fe0" />
        <stop offset="70%" stopColor="#2b1f46" />
        <stop offset="100%" stopColor="#0a0f22" />
      </radialGradient>
      <filter id="nebula-cloud">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.010 0.018"
          numOctaves="3"
          seed={nebulaSeed}
          result="noise"
        />
        <feColorMatrix in="noise" type="luminanceToAlpha" result="alpha" />
        <feGaussianBlur in="alpha" stdDeviation="1.2" result="alphaBlur" />
        <feComponentTransfer in="alphaBlur" result="alphaSoft">
          <feFuncA type="gamma" exponent="1.6" amplitude="1.25" offset="0" />
        </feComponentTransfer>
        <feComposite in="SourceGraphic" in2="alphaSoft" operator="in" />
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

/** ---------- Visible 11×11 generation ---------- */
function makeTilesInWindow(startR, endR, startC, endC) {
  const list = [];
  for (let r = startR; r <= endR; r++) {
    for (let c = startC; c <= endC; c++) {
      const { x, y } = isoPos(r, c);
      list.push({ id: `${r}-${c}`, r, c, x, y });
    }
  }
  return list;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/**
 * Returns the top-left (start) row/col for the visible 11×11 window,
 * centered around `center` when provided; otherwise center of whole grid.
 */
function getVisibleWindow(center /* {x,y} or null */) {
  if (center) {
    const half = Math.floor(VISIBLE_SIZE / 2);
    const start = {
      r: clamp(center.x - half, 0, GRID_SIZE - VISIBLE_SIZE),
      c: clamp(center.y - half, 0, GRID_SIZE - VISIBLE_SIZE),
    };
    return { startR: start.r, endR: start.r + VISIBLE_SIZE - 1, startC: start.c, endC: start.c + VISIBLE_SIZE - 1 };
  }
  // default to dead-center of the 100×100
  const start = Math.floor((GRID_SIZE - VISIBLE_SIZE) / 2);
  return { startR: start, endR: start + VISIBLE_SIZE - 1, startC: start, endC: start + VISIBLE_SIZE - 1 };
}

/** ---------- App ---------- */
export default function App() {
  const [seed, setSeed] = useState(SEED_DEFAULT);
  const nebulaSeed = React.useRef(777).current;

  const tilePoly = useMemo(() => tilePath(), []);
  const defs = useMemo(() => planetDefs(nebulaSeed), [nebulaSeed]);

  const svgRef = useRef(null);
  const hoverRef = useRef(null);

  /** ---- Gate + contract state ---- */
  const [x, setX] = useState("");
  const [y, setY] = useState("");
  const [feeWei, setFeeWei] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ownedCell, setOwnedCell] = useState(null); // {x, y} once we occupy

  // NEW: right-click coordinate tooltip state
  const [tip, setTip] = useState(null); // {x: clientX, y: clientY, r, c}

  // --- Smooth pan (imperative) ---
  // React state (committed)
  const [pan, setPan] = useState({ x: 0, y: 0 });
  // Live refs (no re-render)
  const panRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef({ active: false, start: { x: 0, y: 0 }, orig: { x: 0, y: 0 } });
  const panLayerRef = useRef(null);
  const rafIdRef = useRef(0);
  const [resourceId, setResourceId] = useState(0);

  const RESOURCES = [
  { id: 0, name: "Titanium Alloy" },
  { id: 1, name: "Carbon Nanofibers" },
  { id: 2, name: "Fusion Fuel" },
  { id: 3, name: "Plasma Cells" },
  { id: 4, name: "Silicon Crystals" },
  { id: 5, name: "Quantum Circuits" },
  { id: 6, name: "Dark Matter" },
  { id: 7, name: "Antimatter" },
];



  // --- check if the currently connected wallet already owns a cell
  async function checkExistingClaim() {
    try {
      if (typeof window === "undefined" || !window.ethereum) return;

      // do NOT prompt: just read currently connected accounts
      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      if (!accounts || accounts.length === 0) return;

      const addr = accounts[0];
      const c = getContractMain();
      // Solidity: (bool has, uint8 x, uint8 y)
      const [has, fx, fy /*, resId*/] = await c.getFirstCell(addr);

      if (has) {
        setOwnedCell({ x: Number(fx), y: Number(fy) });
        setError("");
      }
    } catch (e) {
      console.error(e);
      // don't block UI if this fails; just leave the gate visible
    }
  }

  useEffect(() => {
    checkExistingClaim();

    // keep UI in sync if the user switches accounts in the wallet
    if (window?.ethereum) {
      const onAccountsChanged = () => {
        setOwnedCell(null);
        checkExistingClaim();
      };
      window.ethereum.on?.("accountsChanged", onAccountsChanged);
      return () => window.ethereum.removeListener?.("accountsChanged", onAccountsChanged);
    }
  }, []);

  // Fetch occupyFeeWei on mount
  useEffect(() => {
    (async () => {
      try {
        const c = getContractMain();
        const fee = await c.occupyFeeWei();
        setFeeWei(fee);
      } catch (e) {
        console.error(e);
        setError("Failed to read occupy fee from contract.");
      }
    })();
  }, []);

  // Hover outline handler (skips while dragging)
  useEffect(() => {
    const svg = svgRef.current;
    const hover = hoverRef.current;
    if (!svg || !hover) return;

    let raf = 0;
    const onMove = (e) => {
      if (dragRef.current.active) {
        hover.style.display = "none";
        return;
      }
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const g = e.target.closest("g[data-x][data-y]");
        if (g) {
          hover.style.display = "block";
          hover.setAttribute("transform", `translate(${g.dataset.x}, ${g.dataset.y})`);
        } else {
          hover.style.display = "none";
        }
      });
    };
    const onLeave = () => { hover.style.display = "none"; };

    svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointerleave", onLeave);
    return () => {
      svg.removeEventListener("pointermove", onMove);
      svg.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // NEW: right-click -> show coord tooltip; left-click anywhere -> hide
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const onContext = (e) => {
      const g = e.target.closest("g[data-r][data-c]");
      if (!g) return; // not on a tile
      e.preventDefault(); // block browser context menu
      const r = parseInt(g.dataset.r, 10);
      const c = parseInt(g.dataset.c, 10);
      setTip({ x: e.clientX + 8, y: e.clientY + 8, r, c });
    };

    const onClick = () => setTip(null);

    svg.addEventListener("contextmenu", onContext);
    document.addEventListener("click", onClick);
    return () => {
      svg.removeEventListener("contextmenu", onContext);
      document.removeEventListener("click", onClick);
    };
  }, []);

  // Optional: click tooltip to copy "X,Y"
  function copyTip() {
    if (!tip) return;
    const text = `${tip.r},${tip.c}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  }

  /** ---- Tx call ---- */
  async function handleOccupy() {
  setError("");
  try {
    const xi = Number(x);
    const yi = Number(y);
    if (!Number.isInteger(xi) || !Number.isInteger(yi)) {
      setError("Coordinates must be integers.");
      return;
    }
    if (xi < 0 || yi < 0 || xi >= GRID_SIZE || yi >= GRID_SIZE) {
      setError(`Coordinates must be within 0..${GRID_SIZE - 1}.`);
      return;
    }
    if (resourceId < 0 || resourceId > 7) {
      setError("Invalid resource type.");
      return;
    }
    if (!feeWei) {
      setError("Occupy fee is not loaded yet.");
      return;
    }

    setBusy(true);
    const c = await getSignerContractMain();

    // NEW: pass resourceId
    const tx = await c.occupyAt(xi, yi, resourceId, { value: feeWei });
    await tx.wait();

    setOwnedCell({ x: xi, y: yi });
  } catch (e) {
    console.error(e);
    const msg = (e?.message || "").toLowerCase();
    if (msg.includes("outofbounds")) setError("Out of bounds.");
    else if (msg.includes("alreadyoccupied")) setError("That cell is already occupied.");
    else if (msg.includes("wrongfee")) setError("Wrong fee sent.");
    else if (msg.includes("invalidresourcetype")) setError("Invalid resource type.");
    else if (msg.includes("user rejected")) setError("Transaction was rejected.");
    else setError("Failed to occupy the cell. See console for details.");
  } finally {
    setBusy(false);
  }
}


  /** ---- Viewbox / centering logic ---- */
  // Base center (NO pan applied here; pan is an SVG group transform)
  const sizingWidth = SIZING_GRID * TILE_W;
  const sizingHeight = SIZING_GRID * TILE_H;

  let baseMinX = 0, baseMinY = 0;
  if (ownedCell) {
    const { x: cx, y: cy } = isoPos(ownedCell.x, ownedCell.y);
    baseMinX = cx - sizingWidth / 2;
    baseMinY = cy - sizingHeight / 2;
  } else {
    const startCenter = Math.floor((GRID_SIZE - VISIBLE_SIZE) / 2);
    const centerRow = startCenter + Math.floor(VISIBLE_SIZE / 2);
    const centerCol = startCenter + Math.floor(VISIBLE_SIZE / 2);
    const { x: centerX, y: centerY } = isoPos(centerRow, centerCol);
    baseMinX = centerX - sizingWidth / 2;
    baseMinY = centerY - sizingHeight / 2;
  }

  const viewWidth  = sizingWidth;
  const viewHeight = sizingHeight;
  const viewMinX   = baseMinX;
  const viewMinY   = baseMinY;
  const viewBox    = `${viewMinX} ${viewMinY} ${viewWidth} ${viewHeight}`;

  // Compute visible 11x11 window relative to the chosen center
  const { startR: VISIBLE_START_R, endR: VISIBLE_END_R, startC: VISIBLE_START_C, endC: VISIBLE_END_C } =
    getVisibleWindow(ownedCell ? { x: ownedCell.x, y: ownedCell.y } : null);

  // Build ONLY the visible tiles (121 nodes instead of 10,000)
  const visibleTiles = useMemo(() => (
    makeTilesInWindow(VISIBLE_START_R, VISIBLE_END_R, VISIBLE_START_C, VISIBLE_END_C)
  ), [VISIBLE_START_R, VISIBLE_END_R, VISIBLE_START_C, VISIBLE_END_C]);

  // ---- Full-world (100x100) isometric bounding box for background rect ----
  const w2 = TILE_W / 2;
  const h2 = TILE_H / 2;
  const WORLD = {
    minX: -GRID_SIZE * w2,
    minY: -h2,
    width: GRID_SIZE * TILE_W,
    height: (GRID_SIZE - 1) * TILE_H + TILE_H, // = GRID_SIZE * TILE_H
  };

  // ---- Pan limits so the viewBox always stays inside the WORLD rect ----
  const EDGE_PAD = 0; // increase to allow slight overlap margin
  const EDGE_PAD_X = 50;
  const PAN_LIMITS = useMemo(() => {
    const maxX = viewMinX - WORLD.minX - EDGE_PAD_X; // right-most translate
    const minX = (viewMinX + viewWidth)  - (WORLD.minX + WORLD.width) + EDGE_PAD_X;  // left-most
    const maxY = viewMinY - WORLD.minY + EDGE_PAD; // down-most
    const minY = (viewMinY + viewHeight) - (WORLD.minY + WORLD.height) - EDGE_PAD; // up-most
    return { minX, maxX, minY, maxY };
  }, [viewMinX, viewMinY, viewWidth, viewHeight, WORLD.minX, WORLD.minY, WORLD.width, WORLD.height]);

  // whenever we jump centers (e.g., after claim or account switch), reset pan so view recenters and clamp
  useEffect(() => {
    const nx = clamp(0, PAN_LIMITS.minX, PAN_LIMITS.maxX);
    const ny = clamp(0, PAN_LIMITS.minY, PAN_LIMITS.maxY);
    setPan({ x: nx, y: ny });
    panRef.current = { x: nx, y: ny };
    panLayerRef.current?.setAttribute("transform", `translate(${nx} ${ny})`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, ownedCell, PAN_LIMITS.minX, PAN_LIMITS.maxX, PAN_LIMITS.minY, PAN_LIMITS.maxY]);

  function onPointerDown(e) {
    if (e.button === 2) return; // keep right-click tooltip
    const svg = svgRef.current;
    if (!svg) return;

    dragRef.current.active = true;
    dragRef.current.start = { x: e.clientX, y: e.clientY };
    dragRef.current.orig  = { ...panRef.current };

    // hide hover while dragging to save work
    if (hoverRef.current) hoverRef.current.style.display = "none";

    svg.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    if (!dragRef.current.active) return;
    const svg = svgRef.current;
    const panLayer = panLayerRef.current;
    if (!svg || !panLayer) return;

    // convert client delta px -> SVG units
    const rect   = svg.getBoundingClientRect();
    const scaleX = viewWidth  / rect.width;
    const scaleY = viewHeight / rect.height;

    const dxPx = e.clientX - dragRef.current.start.x;
    const dyPx = e.clientY - dragRef.current.start.y;

    let nx = dragRef.current.orig.x + dxPx * scaleX;
    let ny = dragRef.current.orig.y + dyPx * scaleY;

    // ⛳️ keep pan inside gas-cloud bounds
    nx = clamp(nx, PAN_LIMITS.minX, PAN_LIMITS.maxX);
    ny = clamp(ny, PAN_LIMITS.minY, PAN_LIMITS.maxY);

    panRef.current = { x: nx, y: ny };

    if (!rafIdRef.current) {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = 0;
        panLayer.setAttribute("transform", `translate(${panRef.current.x} ${panRef.current.y})`);
      });
    }
  }

  function onPointerUp(e) {
    const svg = svgRef.current;
    dragRef.current.active = false;
    svg?.releasePointerCapture?.(e.pointerId);
    // commit once so position persists (and clamp)
    const nx = clamp(panRef.current.x, PAN_LIMITS.minX, PAN_LIMITS.maxX);
    const ny = clamp(panRef.current.y, PAN_LIMITS.minY, PAN_LIMITS.maxY);
    panRef.current = { x: nx, y: ny };
    setPan({ ...panRef.current });
  }

  /** ---- UI ---- */
  const showGate = !ownedCell; // gate is visible until we have an owned cell in this session

  // ---------- Diamond path for 11×11 visible region ----------
  const diamondPath = useMemo(() => {
    // Four corner tile centers of the 11×11 window
    const topC    = isoPos(VISIBLE_START_R, VISIBLE_START_C);
    const rightC  = isoPos(VISIBLE_START_R, VISIBLE_END_C);
    const bottomC = isoPos(VISIBLE_END_R,   VISIBLE_END_C);
    const leftC   = isoPos(VISIBLE_END_R,   VISIBLE_START_C);

    const w2 = TILE_W / 2;
    const h2 = TILE_H / 2;

    // Vertices of the outer diamond that exactly covers tile faces
    const p1 = { x: topC.x,        y: topC.y - h2     }; // top
    const p2 = { x: rightC.x + w2, y: rightC.y        }; // right
    const p3 = { x: bottomC.x,     y: bottomC.y + h2  }; // bottom
    const p4 = { x: leftC.x - w2,  y: leftC.y         }; // left

    // Optional tiny pad to avoid sub-pixel seams
    const PAD = 0;

    return `M ${p1.x} ${p1.y - PAD}
            L ${p2.x + PAD} ${p2.y}
            L ${p3.x} ${p3.y + PAD}
            L ${p4.x - PAD} ${p4.y}
            Z`;
  }, [VISIBLE_START_R, VISIBLE_START_C, VISIBLE_END_R, VISIBLE_END_C]);

  return (
    <div className="app">
      {/* GATE */}
      {showGate && (
        <div className="gate">
          <div className="gate-card">
            <h2>Claim a Cell</h2>
            <div className="gate-row" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
  <div className="gate-input">
    <label htmlFor="gx">X (0–{GRID_SIZE - 1})</label>
    <input id="gx" type="number" min="0" max={GRID_SIZE - 1} value={x} onChange={e => setX(e.target.value)} />
  </div>

  <div className="gate-input">
    <label htmlFor="gy">Y (0–{GRID_SIZE - 1})</label>
    <input id="gy" type="number" min="0" max={GRID_SIZE - 1} value={y} onChange={e => setY(e.target.value)} />
  </div>

  <div className="gate-input">
    <label htmlFor="gres">Resource Type</label>
    <select
      id="gres"
      value={resourceId}
      onChange={(e) => setResourceId(Number(e.target.value))}
      style={{
        all: "unset",
        padding: "10px 12px",
        borderRadius: "10px",
        border: "1px solid #333",
        background: "#111",
        color: "#fff",
        cursor: "pointer"
      }}
    >
      {RESOURCES.map(r => (
        <option key={r.id} value={r.id} style={{ color: "#000" }}>
          {r.name}
        </option>
      ))}
    </select>
  </div>
</div>


            <div className="gate-actions">
              <button className="gate-btn" disabled={busy} onClick={handleOccupy}>
                {busy ? "Occupying…" : "Occupy"}
              </button>
              <div className="gate-hint">
                Fee: {feeWei ? `${formatEther(feeWei)} ETH` : "loading…"}
              </div>
            </div>

            {error && <div className="gate-error">{error}</div>}
          </div>
        </div>
      )}

      {/* HUD & scene appear underneath; the gate simply covers them until you own a cell */}
      <div className="hud" style={{ display: showGate ? "none" : "flex" }}>
        <h1>Stellar Tactics – Grid Template</h1>
        <div className="controls">
          <button onClick={() => setSeed(Math.floor(Math.random() * 1e9))}>Randomize</button>
          <button onClick={() => setSeed(SEED_DEFAULT)}>Reset</button>
        </div>
      </div>

      <div className="space-bg" style={{ display: showGate ? "none" : "block" }} />
      <div className="space-stars" style={{ display: showGate ? "none" : "block" }} />

      <svg
        ref={svgRef}
        className={`scene ${dragRef.current.active ? "dragging" : ""}`}
        viewBox={viewBox}
        role="img"
        aria-label="isometric space grid"
        style={{ visibility: showGate ? "hidden" : "visible" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {defs}

        {/* Everything that should move with pan goes inside this group */}
        <g ref={panLayerRef} transform={`translate(${pan.x} ${pan.y})`}>

          {/* ---- Mask that hides the nebula INSIDE the isometric 11×11 diamond ---- */}
          <mask id="nebula-cutout">
            {/* white = keep, black = hide */}
            <rect
              x={WORLD.minX}
              y={WORLD.minY}
              width={WORLD.width}
              height={WORLD.height}
              fill="white"
            />
            <path
              d={diamondPath}
              fill="black"
              stroke="black"        // cover sub-pixel joins
              strokeWidth="1.5"
              shapeRendering="crispEdges"
            />
          </mask>

          {/* Nebula layers (masked so they don't show in the 11×11 area) */}
          <g mask="url(#nebula-cutout)">
            {/* World-sized background that covers the entire 100x100 grid */}
            <rect
              className="world-nebula"
              x={WORLD.minX}
              y={WORLD.minY}
              width={WORLD.width}
              height={WORLD.height}
              fill="url(#nebula-colors)"
              filter="url(#nebula-cloud)"
              opacity="0.7"
              style={{ mixBlendMode: "screen", pointerEvents: "none" }}
            />

            <g opacity="0.8" filter="url(#glow)">
              <circle cx={0} cy={0} r={220} fill="url(#nebulaPurple)" />
            </g>
          </g>

          {/* RENDER ONLY 11×11 TILES */}
          <g className="grid">
            {visibleTiles.map(t => (
              <g
                key={t.id}
                data-x={t.x}
                data-y={t.y}
                data-r={t.r}
                data-c={t.c}
                transform={`translate(${t.x}, ${t.y})`}
              >
                <path d={tilePoly} className="tile" />
              </g>
            ))}
          </g>

          {/* Only show a planet at the connected wallet's owned cell */}
          <g className="planets" style={{ pointerEvents: "none" }}>
            {ownedCell && (() => {
              const { x: px, y: py } = isoPos(ownedCell.x, ownedCell.y);
              return (
                <g transform={`translate(${px}, ${py})`}>
                  <g transform="translate(0, -6)">
                    <Planet type="terran" r={18} />
                  </g>
                </g>
              );
            })()}
          </g>

          {/* Single movable hover outline */}
          <path
            ref={hoverRef}
            d={tilePoly}
            className="tile-hover-outline"
            style={{ display: "none" }}
          />
        </g>
      </svg>

      {/* NEW: coordinate tooltip (right-click) */}
      {tip && (
        <div
          className="coord-tip"
          onClick={copyTip}
          style={{
            position: "fixed",
            left: tip.x,
            top: tip.y,
            zIndex: 10000,
            userSelect: "none"
          }}
          title="Click to copy"
        >
          <div className="coord-tip-main">X: {tip.r} &nbsp; Y: {tip.c}</div>
          <div className="coord-tip-sub">Right-click another cell or click anywhere to hide</div>
        </div>
      )}

      <footer className="legend" style={{ display: showGate ? "none" : "flex" }}>
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
