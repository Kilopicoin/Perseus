import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

/**
 * Minimal, responsive 10x10 grid for an on-chain space game.
 * - Click/tap a cell to select
 * - Arrow keys to move selection
 * - Zoom with +/- or mouse wheel (desktop)
 * - Deterministic "planet" layout via seeded RNG
 */

const GRID_SIZE = 11;
const SEED = "crownless-stars-1";

// Tiny seeded RNG (Mulberry32)
function mulberry32(seed) {
  let t = 0;
  for (let i = 0; i < seed.length; i++) t = (t + seed.charCodeAt(i)) | 0;
  let a = t || 1;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t_ = Math.imul(a ^ (a >>> 15), 1 | a);
    t_ ^= t_ + Math.imul(t_ ^ (t_ >>> 7), 61 | t_);
    return ((t_ ^ (t_ >>> 14)) >>> 0) / 4294967296;
  };
}

// Build a deterministic board with ~28% cells having planets
function generateBoard() {
  const rand = mulberry32(SEED);
  const cells = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const r = rand();
      const hasPlanet = r < 0.28;
      let size = 0;
      let kind = null;
      if (hasPlanet) {
        // Size buckets & planet kinds for visual flavor
        const bucket = r < 0.10 ? "large" : r < 0.18 ? "medium" : "small";
        size = bucket === "large" ? 68 : bucket === "medium" ? 52 : 38;
        const kinds = ["ice", "desert", "terra", "gas"];
        kind = kinds[Math.floor(rand() * kinds.length)];
      }
      cells.push({
        id: `${x}-${y}`,
        x,
        y,
        hasPlanet,
        size,
        kind,
        // Placeholder on-chain attributes you can replace with contract reads later:
        owner: null,
        level: hasPlanet ? 1 + Math.floor(rand() * 3) : 0,
        resources: hasPlanet
          ? { metal: Math.floor(rand() * 100), crystal: Math.floor(rand() * 100) }
          : null,
      });
    }
  }
  return cells;
}

function useKeyNavigation(selected, setSelected) {
  useEffect(() => {
    function onKey(e) {
      if (!selected) return;
      const [x, y] = selected.split("-").map(Number);
      let nx = x, ny = y;
      if (e.key === "ArrowLeft") nx = Math.max(0, x - 1);
      if (e.key === "ArrowRight") nx = Math.min(GRID_SIZE - 1, x + 1);
      if (e.key === "ArrowUp") ny = Math.max(0, y - 1);
      if (e.key === "ArrowDown") ny = Math.min(GRID_SIZE - 1, y + 1);
      const nid = `${nx}-${ny}`;
      if (nid !== selected) setSelected(nid);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, setSelected]);
}

export default function App() {
  const board = useMemo(generateBoard, []);
  const [selectedId, setSelectedId] = useState("0-0");
  const [zoom, setZoom] = useState(1);
  const gridRef = useRef(null);

  useKeyNavigation(selectedId, setSelectedId);

  const selectedCell = useMemo(
    () => board.find((c) => c.id === selectedId),
    [board, selectedId]
  );

  // Mouse-wheel zoom (desktop)
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (!e.ctrlKey && Math.abs(e.deltaY) < 20) return; // gentler, require intent
      e.preventDefault();
      setZoom((z) => {
        const next = e.deltaY > 0 ? z * 0.9 : z * 1.1;
        return Math.max(0.6, Math.min(2.2, next));
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Keep selection visible on small screens by auto-scrolling into view
  useEffect(() => {
    const el = document.getElementById(`cell-${selectedId}`);
    if (el && "scrollIntoView" in el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  }, [selectedId]);

  const onZoomIn = () => setZoom((z) => Math.min(2.2, z + 0.1));
  const onZoomOut = () => setZoom((z) => Math.max(0.6, z - 0.1));

  return (
    <div className="app">
      {/* Top bar */}
      <header className="topbar">
        <div className="brand">
          <span className="logo">★</span>
          <span className="title">On-Chain Starlanes</span>
        </div>
        <div className="actions">
          <div className="zoom">
            <button className="btn" onClick={onZoomOut} aria-label="Zoom out">−</button>
            <span className="zoom-value">{Math.round(zoom * 100)}%</span>
            <button className="btn" onClick={onZoomIn} aria-label="Zoom in">+</button>
          </div>
          <button className="btn primary">Connect Wallet</button>
        </div>
      </header>

      <main className="main">
        {/* HUD / Sidebar (collapses to bottom sheet on mobile) */}
        <aside className="hud">
          <h3>Sector</h3>
          <div className="kv"><span>Coords</span><span>{selectedCell.x},{selectedCell.y}</span></div>
          {selectedCell.hasPlanet ? (
            <>
              <div className="kv"><span>Planet</span><span>{selectedCell.kind}</span></div>
              <div className="kv"><span>Level</span><span>{selectedCell.level}</span></div>
              <div className="kv"><span>Owner</span><span>{selectedCell.owner ?? "Unclaimed"}</span></div>
              <div className="kv"><span>Metal</span><span>{selectedCell.resources.metal}</span></div>
              <div className="kv"><span>Crystal</span><span>{selectedCell.resources.crystal}</span></div>
              <div className="hud-actions">
                <button className="btn subtle">Inspect</button>
                <button className="btn subtle">Send Fleet</button>
                <button className="btn subtle">Claim</button>
              </div>
            </>
          ) : (
            <div className="empty">No planet here.</div>
          )}
        </aside>

        {/* Grid */}
        <section className="grid-wrap">
          <div
            className="grid"
            ref={gridRef}
            style={{ transform: `scale(${zoom})` }}
          >
            {board.map((cell) => (
              <GridCell
                key={cell.id}
                cell={cell}
                selected={cell.id === selectedId}
                onSelect={() => setSelectedId(cell.id)}
              />
            ))}
          </div>
        </section>
      </main>

      <footer className="footer">
        <span>Tip: Use arrow keys to move. Zoom with mouse wheel or the buttons.</span>
      </footer>
    </div>
  );
}

function GridCell({ cell, selected, onSelect }) {
  return (
    <button
      id={`cell-${cell.id}`}
      className={`cell ${selected ? "selected" : ""}`}
      onClick={onSelect}
      aria-label={`Cell ${cell.x},${cell.y}${cell.hasPlanet ? " with planet" : ""}`}
    >
      <span className="coords">{cell.x},{cell.y}</span>

      {cell.hasPlanet && (
        <span
          className={`planet ${cell.kind}`}
          style={{ width: cell.size + "px", height: cell.size + "px" }}
        />
      )}
    </button>
  );
}
