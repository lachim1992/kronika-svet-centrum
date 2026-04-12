/**
 * MapMinimap — small overview of all hexes with viewport indicator.
 * Click to jump to position.
 */
import { useMemo, useCallback, memo } from "react";

const MINIMAP_W = 140;
const MINIMAP_H = 90;
const DOT_SIZE = 2;

interface HexCoord { q: number; r: number }

interface Props {
  hexCoords: HexCoord[];
  viewportCenter: { x: number; y: number };
  zoom: number;
  containerWidth: number;
  containerHeight: number;
  onJump: (worldX: number, worldY: number) => void;
}

const SQRT3 = Math.sqrt(3);
const HEX_SIZE = 38;
function hexToPixel(q: number, r: number) {
  return { x: HEX_SIZE * (SQRT3 * q + (SQRT3 / 2) * r), y: HEX_SIZE * 1.5 * r };
}

const MapMinimap = memo(({ hexCoords, viewportCenter, zoom, containerWidth, containerHeight, onJump }: Props) => {
  // Compute bounds of all hexes in world space
  const { minX, maxX, minY, maxY, worldW, worldH } = useMemo(() => {
    if (hexCoords.length === 0) return { minX: 0, maxX: 1, minY: 0, maxY: 1, worldW: 1, worldH: 1 };
    let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity;
    for (const c of hexCoords) {
      const p = hexToPixel(c.q, c.r);
      if (p.x < mnX) mnX = p.x;
      if (p.x > mxX) mxX = p.x;
      if (p.y < mnY) mnY = p.y;
      if (p.y > mxY) mxY = p.y;
    }
    const pad = HEX_SIZE * 2;
    mnX -= pad; mxX += pad; mnY -= pad; mxY += pad;
    return { minX: mnX, maxX: mxX, minY: mnY, maxY: mxY, worldW: mxX - mnX, worldH: mxY - mnY };
  }, [hexCoords]);

  const scale = useMemo(() => {
    if (worldW === 0 || worldH === 0) return 1;
    return Math.min(MINIMAP_W / worldW, MINIMAP_H / worldH);
  }, [worldW, worldH]);

  // Hex dots in minimap coords
  const dots = useMemo(() => {
    return hexCoords.map(c => {
      const p = hexToPixel(c.q, c.r);
      return { x: (p.x - minX) * scale, y: (p.y - minY) * scale };
    });
  }, [hexCoords, minX, minY, scale]);

  // Viewport rect in minimap coords
  const viewRect = useMemo(() => {
    const vpHalfW = (containerWidth / zoom) / 2;
    const vpHalfH = (containerHeight / zoom) / 2;
    const cx = viewportCenter.x;
    const cy = viewportCenter.y;
    return {
      x: (cx - vpHalfW - minX) * scale,
      y: (cy - vpHalfH - minY) * scale,
      w: (vpHalfW * 2) * scale,
      h: (vpHalfH * 2) * scale,
    };
  }, [viewportCenter, zoom, containerWidth, containerHeight, minX, minY, scale]);

  const handleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const worldX = mx / scale + minX;
    const worldY = my / scale + minY;
    onJump(worldX, worldY);
  }, [scale, minX, minY, onJump]);

  if (hexCoords.length < 3) return null;

  return (
    <div className="absolute bottom-3 right-3 z-20 rounded-lg overflow-hidden border border-border bg-card/80 backdrop-blur-sm shadow-lg cursor-pointer"
      style={{ width: MINIMAP_W, height: MINIMAP_H }}>
      <svg width={MINIMAP_W} height={MINIMAP_H} onClick={handleClick}>
        {/* Hex dots */}
        {dots.map((d, i) => (
          <rect key={i} x={d.x - DOT_SIZE / 2} y={d.y - DOT_SIZE / 2} width={DOT_SIZE} height={DOT_SIZE}
            fill="hsl(var(--muted-foreground))" opacity={0.5} />
        ))}
        {/* Viewport rectangle */}
        <rect
          x={viewRect.x} y={viewRect.y} width={Math.max(8, viewRect.w)} height={Math.max(6, viewRect.h)}
          fill="none" stroke="hsl(45, 90%, 55%)" strokeWidth={1.5} rx={1}
        />
      </svg>
    </div>
  );
});

MapMinimap.displayName = "MapMinimap";
export default MapMinimap;
