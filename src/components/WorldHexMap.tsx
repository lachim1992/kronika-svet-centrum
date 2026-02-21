import { useState, useCallback, useEffect, useRef, useMemo, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Hexagon, Map, Compass, Eye, Plus, Minus } from "lucide-react";
import { useHexMap, axialRange, type HexData } from "@/hooks/useHexMap";

/* ───── Config ───── */
const HEX_SIZE = 38;
const RENDER_RADIUS = 6;
const SQRT3 = Math.sqrt(3);

const BIOME_COLORS: Record<string, string> = {
  sea: "#1a3550",
  plains: "#4a6030",
  forest: "#1f4a28",
  hills: "#6a5a38",
  mountains: "#4a4a50",
  desert: "#8a7a40",
  swamp: "#2a4a3a",
  tundra: "#4a6878",
};
const BIOME_LABELS: Record<string, string> = {
  sea: "Moře", plains: "Pláně", forest: "Les", hills: "Kopce",
  mountains: "Hory", desert: "Poušť", swamp: "Bažiny", tundra: "Tundra",
};

const FOG_COLOR = "#111318";

/* ───── Hex math ───── */
function hexToPixel(q: number, r: number) {
  return {
    x: HEX_SIZE * (SQRT3 * q + (SQRT3 / 2) * r),
    y: HEX_SIZE * 1.5 * r,
  };
}

function hexPoints(cx: number, cy: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${cx + HEX_SIZE * Math.cos(a)},${cy + HEX_SIZE * Math.sin(a)}`;
  }).join(" ");
}

/* ───── Props ───── */
interface Props {
  sessionId: string;
  playerName: string;
  myRole: string;
}

/* ───── Single hex tile (memoized) ───── */
const HexTile = memo(({
  q, r, hex, visible, isCenter, devMode, loading, onClick,
  offsetX, offsetY,
}: {
  q: number; r: number; hex?: HexData; visible: boolean;
  isCenter: boolean; devMode: boolean; loading: boolean;
  onClick: () => void; offsetX: number; offsetY: number;
}) => {
  const pos = hexToPixel(q, r);
  const cx = pos.x + offsetX;
  const cy = pos.y + offsetY;
  const pts = hexPoints(cx, cy);
  const show = visible || devMode;
  const fillColor = show && hex ? (BIOME_COLORS[hex.biome_family] || BIOME_COLORS.plains) : FOG_COLOR;

  return (
    <g onClick={show ? onClick : undefined} className={show ? "cursor-pointer" : ""}>
      <polygon
        points={pts}
        fill={fillColor}
        stroke={isCenter ? "hsl(var(--primary))" : "hsl(var(--border))"}
        strokeWidth={isCenter ? 2.5 : 0.8}
        opacity={show && hex ? 1 : 0.35}
        className="transition-opacity"
      />
      {loading && (
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
          fill="hsl(var(--muted-foreground))" fontSize="10">⏳</text>
      )}
      {show && hex && !loading && (
        <>
          <text x={cx} y={cy - 8} textAnchor="middle" dominantBaseline="middle"
            fill="white" fontSize="9" fontWeight="600" style={{ pointerEvents: "none" }}>
            {BIOME_LABELS[hex.biome_family] || hex.biome_family}
          </text>
          <text x={cx} y={cy + 4} textAnchor="middle" dominantBaseline="middle"
            fill="hsl(var(--muted-foreground))" fontSize="7" style={{ pointerEvents: "none" }}>
            H:{hex.mean_height}
          </text>
          {hex.coastal && (
            <text x={cx} y={cy + 14} textAnchor="middle" dominantBaseline="middle"
              fill="#60a5fa" fontSize="7" style={{ pointerEvents: "none" }}>🌊</text>
          )}
          {devMode && (
            <text x={cx} y={cy + 22} textAnchor="middle" dominantBaseline="middle"
              fill="hsl(var(--muted-foreground))" fontSize="6" opacity={0.5} style={{ pointerEvents: "none" }}>
              ({q},{r})
            </text>
          )}
        </>
      )}
      {!show && !loading && (
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
          fill="hsl(var(--muted-foreground))" fontSize="8" opacity={0.3} style={{ pointerEvents: "none" }}>?</text>
      )}
    </g>
  );
});
HexTile.displayName = "HexTile";

/* ───── Main component ───── */
const WorldHexMap = ({ sessionId, playerName, myRole }: Props) => {
  const isAdmin = myRole === "admin";
  const [centerQ, setCenterQ] = useState(0);
  const [centerR, setCenterR] = useState(0);
  const [devMode, setDevMode] = useState(false);
  const [selectedHex, setSelectedHex] = useState<HexData | null>(null);
  const [discoveredSet, setDiscoveredSet] = useState<Set<string>>(new Set());
  const [exploring, setExploring] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Pan state
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { getHex, isLoading, ensureHexes } = useHexMap(sessionId);

  // Load discoveries
  const fetchDiscoveries = useCallback(async () => {
    if (isAdmin) return;
    const { data } = await supabase
      .from("discoveries")
      .select("entity_id")
      .eq("session_id", sessionId)
      .eq("player_name", playerName)
      .eq("entity_type", "province_hex");
    const set = new Set((data || []).map(d => d.entity_id));
    setDiscoveredSet(set);
  }, [sessionId, playerName, isAdmin]);

  useEffect(() => { fetchDiscoveries(); }, [fetchDiscoveries]);

  const isDiscovered = useCallback((hexId?: string) => {
    if (isAdmin || devMode) return true;
    return hexId ? discoveredSet.has(hexId) : false;
  }, [isAdmin, devMode, discoveredSet]);

  // Visible coords based on center + radius
  const visibleCoords = useMemo(() => axialRange(centerQ, centerR, RENDER_RADIUS), [centerQ, centerR]);

  // Debounced loading
  const loadVisible = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      ensureHexes(visibleCoords);
    }, 250);
  }, [visibleCoords, ensureHexes]);

  useEffect(() => {
    if (mapLoaded) loadVisible();
  }, [mapLoaded, loadVisible]);

  const handleLoadMap = async () => {
    setMapLoaded(true);
    await ensureHexes(visibleCoords);
  };

  // Navigation
  const navigateTo = useCallback((q: number, r: number) => {
    setCenterQ(q);
    setCenterR(r);
    setPan({ x: 0, y: 0 });
    setSelectedHex(null);
  }, []);

  // Pan handlers
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
  }, [pan]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy });
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  // Zoom
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.max(0.4, Math.min(2.5, z - e.deltaY * 0.001)));
  }, []);

  const zoomIn = () => setZoom(z => Math.min(2.5, z + 0.2));
  const zoomOut = () => setZoom(z => Math.max(0.4, z - 0.2));

  // Explore action
  const handleExplore = async () => {
    setExploring(true);
    try {
      // Generate hexes within radius 2 of center
      const exploreCoords = axialRange(centerQ, centerR, 2);
      await ensureHexes(exploreCoords);

      // Mark all as discovered
      for (const c of exploreCoords) {
        const hex = getHex(c.q, c.r);
        if (hex) {
          await supabase.from("discoveries").upsert({
            session_id: sessionId,
            player_name: playerName,
            entity_type: "province_hex",
            entity_id: hex.id,
            source: "explore",
          }, { onConflict: "session_id,player_name,entity_type,entity_id" });
        }
      }
      await fetchDiscoveries();
    } finally {
      setExploring(false);
    }
  };

  // SVG viewbox calculation
  const svgW = 800;
  const svgH = 600;
  const offsetX = svgW / 2;
  const offsetY = svgH / 2;
  // Adjust offset for center hex
  const centerPx = hexToPixel(centerQ, centerR);

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Map className="h-4 w-4 text-primary" />
        <h3 className="font-display font-semibold text-sm">Mapa světa</h3>
        <div className="ml-auto flex items-center gap-2">
          {isAdmin && (
            <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
              <Switch
                checked={devMode}
                onCheckedChange={setDevMode}
                className="scale-75"
              />
              <Eye className="h-3 w-3" /> DEV
            </label>
          )}
        </div>
      </div>

      {!mapLoaded ? (
        <div className="game-card p-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">Načtěte hex mapu světa</p>
          <Button onClick={handleLoadMap} variant="outline" className="font-display gap-2">
            <Map className="h-4 w-4" />
            Zobrazit mapu
          </Button>
        </div>
      ) : (
        <>
          {/* Map container */}
          <div
            ref={containerRef}
            className="game-card p-0 overflow-hidden relative select-none touch-none"
            style={{ height: "420px" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onWheel={onWheel}
          >
            <svg
              width="100%"
              height="100%"
              viewBox={`0 0 ${svgW} ${svgH}`}
              preserveAspectRatio="xMidYMid meet"
            >
              <g transform={`translate(${pan.x / zoom}, ${pan.y / zoom}) scale(${zoom})`}>
                {visibleCoords.map(c => {
                  const hex = getHex(c.q, c.r);
                  const visible = isDiscovered(hex?.id);
                  return (
                    <HexTile
                      key={`${c.q},${c.r}`}
                      q={c.q}
                      r={c.r}
                      hex={hex}
                      visible={visible}
                      isCenter={c.q === centerQ && c.r === centerR}
                      devMode={devMode}
                      loading={isLoading(c.q, c.r)}
                      onClick={() => hex && setSelectedHex(hex)}
                      offsetX={offsetX - centerPx.x}
                      offsetY={offsetY - centerPx.y}
                    />
                  );
                })}
              </g>
            </svg>

            {/* Zoom controls */}
            <div className="absolute bottom-2 right-2 flex flex-col gap-1 z-10">
              <Button size="icon" variant="secondary" className="h-7 w-7" onClick={zoomIn}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="secondary" className="h-7 w-7" onClick={zoomOut}>
                <Minus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Controls bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[9px]">
              Střed: ({centerQ}, {centerR})
            </Badge>
            {!isAdmin && (
              <Button
                size="sm"
                variant="outline"
                className="font-display gap-1.5 text-xs ml-auto"
                onClick={handleExplore}
                disabled={exploring}
              >
                {exploring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Compass className="h-3.5 w-3.5" />}
                Prozkoumat okolí
              </Button>
            )}
          </div>
        </>
      )}

      {/* Province detail modal */}
      <Dialog open={!!selectedHex} onOpenChange={() => setSelectedHex(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Hexagon className="h-5 w-5 text-primary" />
              Provincie ({selectedHex?.q}, {selectedHex?.r})
            </DialogTitle>
          </DialogHeader>
          {selectedHex && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <InfoRow label="Biom" value={BIOME_LABELS[selectedHex.biome_family] || selectedHex.biome_family} />
                <InfoRow label="Výška" value={`${selectedHex.mean_height}/100`} />
                <InfoRow label="Vlhkost" value={`Band ${selectedHex.moisture_band}`} />
                <InfoRow label="Teplota" value={`Band ${selectedHex.temp_band}`} />
                <InfoRow label="Pobřeží" value={selectedHex.coastal ? "✅ Ano" : "❌ Ne"} />
                <InfoRow label="Seed" value={selectedHex.seed.slice(-8)} />
              </div>
              {selectedHex.macro_region && (
                <div className="p-3 rounded-lg border border-border bg-muted/30">
                  <p className="text-xs font-display font-semibold mb-1">Makroregion</p>
                  <p className="text-sm font-display">{selectedHex.macro_region.name}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Klíč: {selectedHex.macro_region.region_key} |
                    Elev: {selectedHex.macro_region.elevation_band} |
                    Clim: {selectedHex.macro_region.climate_band} |
                    Moist: {selectedHex.macro_region.moisture_band}
                  </p>
                </div>
              )}
              <Button
                variant="outline"
                className="w-full font-display gap-2"
                onClick={() => navigateTo(selectedHex.q, selectedHex.r)}
              >
                <Hexagon className="h-4 w-4" />
                Centrovat mapu sem
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
};

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2 rounded border border-border bg-card">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-sm font-display font-semibold">{value}</p>
    </div>
  );
}

export default WorldHexMap;
