import { memo, useRef, useState } from "react";
import { projectCell } from "@/lib/mapTopology";
import { MICRO_PER_TILE, planMicroRoute, tileOfMicro, type Micro, type MicroTerrain } from "../../../supabase/functions/_shared/microMovement";

const TILE_SIZE = 42;

export function microWorldPoint(m: Micro) {
  const t = tileOfMicro(m); const c = projectCell("square4", { a: t.gridX, b: t.gridY }, TILE_SIZE);
  const px = (m.x - t.gridX * MICRO_PER_TILE + .5) / MICRO_PER_TILE, py = (m.y - t.gridY * MICRO_PER_TILE + .5) / MICRO_PER_TILE;
  return { x: c.x + (px - py) * TILE_SIZE, y: c.y + (px + py - 1) * TILE_SIZE / 2 };
}

/**
 * Pointer capture + live route preview for army movement. Hover state lives here so
 * moving the mouse re-renders only this overlay, never the whole map.
 */
function ArmyMoveOverlayBase({ start, waypoints, terrainAt, committed, isDrag, onPick }: {
  start: Micro; waypoints: Micro[]; terrainAt: (m: Micro) => MicroTerrain | undefined; committed: boolean; isDrag: () => boolean; onPick: (m: Micro | null) => void;
}) {
  const [hover, setHover] = useState<Micro | null>(null);
  const frame = useRef<number | null>(null);
  const last = useRef<string>("");
  const toMicro = (el: SVGRectElement, clientX: number, clientY: number): Micro | null => {
    const ctm = el.getScreenCTM(); const svg = el.ownerSVGElement; if (!ctm || !svg) return null;
    const pt = svg.createSVGPoint(); pt.x = clientX; pt.y = clientY;
    const loc = pt.matrixTransform(ctm.inverse());
    const u = loc.x / TILE_SIZE, v = 2 * loc.y / TILE_SIZE;
    return { x: Math.floor(((u + v) / 2 + .5) * MICRO_PER_TILE), y: Math.floor(((v - u) / 2 + .5) * MICRO_PER_TILE) };
  };
  const plan = !committed && hover ? planMicroRoute(start, [...waypoints, hover], terrainAt) : null;
  const pts = plan ? plan.path.map(microWorldPoint) : [];
  const tgt = hover ? microWorldPoint(hover) : null;
  const end = pts[pts.length - 1];
  return <>
    <rect x={-100000} y={-100000} width={200000} height={200000} fill="transparent" className="cursor-crosshair" data-army-move-capture
      onPointerMove={(event) => {
        if (committed) return; const el = event.currentTarget; const { clientX, clientY } = event;
        if (frame.current !== null) return;
        frame.current = requestAnimationFrame(() => {
          frame.current = null; const m = toMicro(el, clientX, clientY); if (!m) return;
          const key = `${m.x},${m.y}`; if (key === last.current) return; last.current = key; setHover(m);
        });
      }}
      onClick={(event) => { event.stopPropagation(); if (isDrag()) return; const m = toMicro(event.currentTarget, event.clientX, event.clientY); if (m) onPick(m); }}
      onContextMenu={(event) => { event.preventDefault(); onPick(null); }} />
    {pts.length > 0 && <g pointerEvents="none" data-army-move-preview>
      <polyline points={pts.map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke="var(--map-marker)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity=".6" />
      <polyline points={pts.map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke="var(--map-focus)" strokeWidth="2" strokeDasharray="5 3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={end.x} cy={end.y} r="4.5" fill="none" stroke="var(--map-focus)" strokeWidth="2" />
      {tgt && plan && !plan.reachedTarget && <>
        <line x1={end.x} y1={end.y} x2={tgt.x} y2={tgt.y} stroke="var(--map-city-rival)" strokeWidth="1.4" strokeDasharray="3 3" opacity=".8" />
        <circle cx={tgt.x} cy={tgt.y} r="3.5" fill="none" stroke="var(--map-city-rival)" strokeWidth="1.5" strokeDasharray="2 2" />
      </>}
      {plan && <text x={end.x} y={end.y - 8} textAnchor="middle" fontSize="7" fontWeight="700" fill="var(--map-label)" stroke="var(--map-label-edge)" strokeWidth="2" paintOrder="stroke">{(plan.spent / 10).toLocaleString("cs-CZ")} b.</text>}
    </g>}
  </>;
}

export default memo(ArmyMoveOverlayBase);
