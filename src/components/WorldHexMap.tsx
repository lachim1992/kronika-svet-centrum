import { useState, useCallback, useEffect, useRef, useMemo, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Hexagon, Map as MapIcon, Eye, Plus, Minus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useHexMap, AXIAL_NEIGHBORS, type HexData } from "@/hooks/useHexMap";

/* ───── Config ───── */
const HEX_SIZE = 38;
const SQRT3 = Math.sqrt(3);

const BIOME_COLORS: Record<string, string> = {
  sea: "#1a3550", plains: "#4a6030", forest: "#1f4a28", hills: "#6a5a38",
  mountains: "#4a4a50", desert: "#8a7a40", swamp: "#2a4a3a", tundra: "#4a6878",
};
const BIOME_LABELS: Record<string, string> = {
  sea: "Moře", plains: "Pláně", forest: "Les", hills: "Kopce",
  mountains: "Hory", desert: "Poušť", swamp: "Bažiny", tundra: "Tundra",
};
const FOG_COLOR = "#111318";

/* ───── Hex math ───── */
function hexToPixel(q: number, r: number) {
  return { x: HEX_SIZE * (SQRT3 * q + (SQRT3 / 2) * r), y: HEX_SIZE * 1.5 * r };
}
function hexPoints(cx: number, cy: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${cx + HEX_SIZE * Math.cos(a)},${cy + HEX_SIZE * Math.sin(a)}`;
  }).join(" ");
}
const hKey = (q: number, r: number) => `${q},${r}`;

/* ───── Props ───── */
interface Props { sessionId: string; playerName: string; myRole: string; }

/* ───── Memoized hex tile ───── */
const HexTile = memo(({
  q, r, hex, isFrontier, devMode, loading, onClick, offsetX, offsetY,
}: {
  q: number; r: number; hex?: HexData; isFrontier: boolean;
  devMode: boolean; loading: boolean;
  onClick: () => void; offsetX: number; offsetY: number;
}) => {
  const pos = hexToPixel(q, r);
  const cx = pos.x + offsetX;
  const cy = pos.y + offsetY;
  const pts = hexPoints(cx, cy);
  const isRevealed = !isFrontier;
  const showBiome = isRevealed && hex;
  const fillColor = showBiome ? (BIOME_COLORS[hex.biome_family] || BIOME_COLORS.plains) : FOG_COLOR;

  return (
    <g onClick={onClick} className="cursor-pointer">
      <polygon
        points={pts}
        fill={fillColor}
        stroke={isFrontier ? "hsl(var(--muted-foreground) / 0.3)" : "hsl(var(--border))"}
        strokeWidth={0.8}
        opacity={showBiome ? 1 : 0.3}
        strokeDasharray={isFrontier ? "3,3" : undefined}
      />
      {loading && (
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
          fill="hsl(var(--muted-foreground))" fontSize="10">⏳</text>
      )}
      {showBiome && !loading && (
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
      {isFrontier && !loading && (
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
          fill="hsl(var(--primary))" fontSize="10" opacity={0.6} style={{ pointerEvents: "none" }}>?</text>
      )}
    </g>
  );
});
HexTile.displayName = "HexTile";

/* ───── Main component ───── */
const WorldHexMap = ({ sessionId, playerName, myRole }: Props) => {
  const isAdmin = myRole === "admin";
  const [devMode, setDevMode] = useState(isAdmin);
  const [selectedHex, setSelectedHex] = useState<HexData | null>(null);
  const [discoveredIds, setDiscoveredIds] = useState<Set<string>>(new Set());
  const [discoveredCoords, setDiscoveredCoords] = useState<Set<string>>(new Set());
  const [exploring, setExploring] = useState<string | null>(null); // key of frontier being explored
  const [zoom, setZoom] = useState(1);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [recomputing, setRecomputing] = useState(false);

  // Pan state
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number; moved: boolean } | null>(null);

  const { hexes, getHex, isLoading, fetchHex, loadHexesByIds, loadAllGenerated } = useHexMap(sessionId);

  /* ── Load player discoveries ── */
  const fetchDiscoveries = useCallback(async () => {
    const { data } = await supabase
      .from("discoveries")
      .select("entity_id")
      .eq("session_id", sessionId)
      .eq("player_name", playerName)
      .eq("entity_type", "province_hex");
    const ids = (data || []).map(d => d.entity_id);
    setDiscoveredIds(new Set(ids));
    // Also load the actual hex data for these IDs
    await loadHexesByIds(ids);
  }, [sessionId, playerName, loadHexesByIds]);

  // After hexes load, compute discovered coord set
  useEffect(() => {
    const coords = new Set<string>();
    for (const id of discoveredIds) {
      const hex = Object.values(hexes).find(h => h.id === id);
      if (hex) coords.add(hKey(hex.q, hex.r));
    }
    setDiscoveredCoords(coords);
  }, [discoveredIds, hexes]);

  /* ── Compute frontier tiles ── */
  const frontierCoords = useMemo(() => {
    if (isAdmin && !devMode) return new Set<string>(); // admin sees all, no frontier needed
    const frontier = new Set<string>();
    for (const coordStr of discoveredCoords) {
      const [q, r] = coordStr.split(",").map(Number);
      for (const n of AXIAL_NEIGHBORS) {
        const nk = hKey(q + n.dq, r + n.dr);
        if (!discoveredCoords.has(nk)) frontier.add(nk);
      }
    }
    return frontier;
  }, [discoveredCoords, isAdmin, devMode]);

  /* ── All tiles to render ── */
  const renderCoords = useMemo(() => {
    const all = new Map<string, { q: number; r: number; isFrontier: boolean }>();

    if (isAdmin && devMode) {
      // Show all generated hexes + frontier of discovered
      for (const key of Object.keys(hexes)) {
        const [q, r] = key.split(",").map(Number);
        all.set(key, { q, r, isFrontier: false });
      }
      // Also add frontier for discovered
      for (const fk of frontierCoords) {
        if (!all.has(fk)) {
          const [q, r] = fk.split(",").map(Number);
          all.set(fk, { q, r, isFrontier: true });
        }
      }
    } else {
      // Discovered tiles
      for (const coordStr of discoveredCoords) {
        const [q, r] = coordStr.split(",").map(Number);
        all.set(coordStr, { q, r, isFrontier: false });
      }
      // Frontier tiles
      for (const fk of frontierCoords) {
        const [q, r] = fk.split(",").map(Number);
        all.set(fk, { q, r, isFrontier: true });
      }
    }
    return Array.from(all.values());
  }, [hexes, discoveredCoords, frontierCoords, isAdmin, devMode]);

  /* ── Camera center (average of discovered hexes) ── */
  const cameraCenter = useMemo(() => {
    if (discoveredCoords.size === 0) return { x: 0, y: 0 };
    let sx = 0, sy = 0, n = 0;
    for (const coordStr of discoveredCoords) {
      const [q, r] = coordStr.split(",").map(Number);
      const p = hexToPixel(q, r);
      sx += p.x; sy += p.y; n++;
    }
    return { x: sx / n, y: sy / n };
  }, [discoveredCoords]);

  /* ── Initial load ── */
  const handleLoadMap = useCallback(async () => {
    setMapLoaded(true);
    if (isAdmin) {
      await loadAllGenerated();
    }
    await fetchDiscoveries();

    // If player has no discoveries, auto-explore (0,0)
    // We check after fetch completes
  }, [isAdmin, loadAllGenerated, fetchDiscoveries]);

  // Auto-seed (0,0) if no discoveries
  useEffect(() => {
    if (!mapLoaded) return;
    if (!isAdmin && discoveredIds.size === 0) {
      // Seed starting hex at (0,0)
      (async () => {
        const hex = await fetchHex(0, 0);
        if (hex) {
          await supabase.from("discoveries").upsert({
            session_id: sessionId,
            player_name: playerName,
            entity_type: "province_hex",
            entity_id: hex.id,
            source: "start",
          }, { onConflict: "session_id,player_name,entity_type,entity_id" });
          await fetchDiscoveries();
        }
      })();
    }
  }, [mapLoaded, discoveredIds.size, isAdmin, sessionId, playerName, fetchHex, fetchDiscoveries]);

  /* ── Explore frontier tile ── */
  const handleExploreFrontier = useCallback(async (q: number, r: number) => {
    const key = hKey(q, r);
    setExploring(key);
    try {
      // Generate/fetch the hex
      const hex = await fetchHex(q, r);
      if (!hex) return;
      // Insert discovery
      await supabase.from("discoveries").upsert({
        session_id: sessionId,
        player_name: playerName,
        entity_type: "province_hex",
        entity_id: hex.id,
        source: "explore",
      }, { onConflict: "session_id,player_name,entity_type,entity_id" });
      await fetchDiscoveries();
    } finally {
      setExploring(null);
    }
  }, [sessionId, playerName, fetchHex, fetchDiscoveries]);

  /* ── Pan handlers ── */
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y, moved: false };
  }, [pan]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;
    setPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy });
  }, []);

  const onPointerUp = useCallback(() => { dragRef.current = null; }, []);

  const wasDrag = useCallback(() => dragRef.current?.moved ?? false, []);

  // Zoom
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.max(0.3, Math.min(3, z - e.deltaY * 0.001)));
  }, []);
  const zoomIn = () => setZoom(z => Math.min(3, z + 0.2));
  const zoomOut = () => setZoom(z => Math.max(0.3, z - 0.2));

  /* ── Recompute biomes (DEV) ── */
  const handleRecomputeBiomes = useCallback(async () => {
    const allIds = Object.values(hexes).map(h => h.id).filter(Boolean);
    if (allIds.length === 0) { toast.error("Žádné hexy k přepočtu"); return; }
    setRecomputing(true);
    try {
      const { data, error } = await supabase.functions.invoke("recompute-biomes", {
        body: { session_id: sessionId, hex_ids: allIds },
      });
      if (error) throw error;
      const updated = data?.updated || [];
      // Refresh hex cache
      if (isAdmin) await loadAllGenerated();
      await fetchDiscoveries();
      toast.success(`Přepočteno ${updated.length} hexů`);
    } catch (e: any) {
      toast.error("Chyba: " + (e.message || "neznámá"));
    } finally {
      setRecomputing(false);
    }
  }, [hexes, sessionId, isAdmin, loadAllGenerated, fetchDiscoveries]);

  /* ── Handle tile click ── */
  const handleTileClick = useCallback((q: number, r: number, isFrontier: boolean) => {
    // Ignore if it was a drag
    if (dragRef.current?.moved) return;
    if (isFrontier) {
      handleExploreFrontier(q, r);
    } else {
      const hex = getHex(q, r);
      if (hex) setSelectedHex(hex);
    }
  }, [getHex, handleExploreFrontier]);

  /* ── SVG layout ── */
  const svgW = 800;
  const svgH = 600;
  const offsetX = svgW / 2 - cameraCenter.x;
  const offsetY = svgH / 2 - cameraCenter.y;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <MapIcon className="h-4 w-4 text-primary" />
        <h3 className="font-display font-semibold text-sm">Mapa světa</h3>
        <div className="ml-auto flex items-center gap-2">
          {isAdmin && (
            <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
              <Switch checked={devMode} onCheckedChange={async (v) => {
                setDevMode(v);
                if (v) await loadAllGenerated();
              }} className="scale-75" />
              <Eye className="h-3 w-3" /> DEV
            </label>
          )}
          {isAdmin && devMode && (
            <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1"
              onClick={handleRecomputeBiomes} disabled={recomputing}>
              {recomputing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Přepočítat biomy (DEV)
            </Button>
          )}
        </div>
      </div>

      {!mapLoaded ? (
        <div className="game-card p-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">Načtěte hex mapu světa</p>
          <Button onClick={handleLoadMap} variant="outline" className="font-display gap-2">
            <MapIcon className="h-4 w-4" /> Zobrazit mapu
          </Button>
        </div>
      ) : (
        <>
          <div
            className="game-card p-0 overflow-hidden relative select-none touch-none"
            style={{ height: "420px" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onWheel={onWheel}
          >
            <svg width="100%" height="100%" viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="xMidYMid meet">
              <g transform={`translate(${pan.x / zoom}, ${pan.y / zoom}) scale(${zoom})`}>
                {renderCoords.map(c => {
                  const hex = getHex(c.q, c.r);
                  return (
                    <HexTile
                      key={hKey(c.q, c.r)}
                      q={c.q} r={c.r}
                      hex={hex}
                      isFrontier={c.isFrontier}
                      devMode={devMode}
                      loading={isLoading(c.q, c.r) || exploring === hKey(c.q, c.r)}
                      onClick={() => handleTileClick(c.q, c.r, c.isFrontier)}
                      offsetX={offsetX}
                      offsetY={offsetY}
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

            {/* Info overlay */}
            {renderCoords.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[9px]">
              {discoveredCoords.size} provinc{discoveredCoords.size === 1 ? "ie" : "ií"} objeveno
            </Badge>
            <Badge variant="outline" className="text-[9px]">
              {frontierCoords.size} na hranici
            </Badge>
            <p className="text-[10px] text-muted-foreground ml-auto italic">
              Klikněte na ? hex pro průzkum
            </p>
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
