import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Hexagon, Waves, Mountain, TreePine, Wheat, Snowflake, Sun, Wind } from "lucide-react";

interface HexData {
  id: string;
  q: number;
  r: number;
  mean_height: number;
  biome_family: string;
  coastal: boolean;
  moisture_band: number;
  temp_band: number;
  seed: string;
  macro_region?: {
    id: string;
    name: string;
    region_key: string;
    climate_band: number;
    elevation_band: number;
    moisture_band: number;
  } | null;
}

interface Props {
  sessionId: string;
}

const BIOME_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  sea:       { label: "Moře",     icon: <Waves className="h-3.5 w-3.5" />,    color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  plains:    { label: "Pláně",    icon: <Wheat className="h-3.5 w-3.5" />,    color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
  forest:    { label: "Les",      icon: <TreePine className="h-3.5 w-3.5" />, color: "bg-green-500/20 text-green-300 border-green-500/30" },
  hills:     { label: "Kopce",    icon: <Mountain className="h-3.5 w-3.5" />, color: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  mountains: { label: "Hory",     icon: <Mountain className="h-3.5 w-3.5" />, color: "bg-stone-500/20 text-stone-300 border-stone-500/30" },
  desert:    { label: "Poušť",    icon: <Sun className="h-3.5 w-3.5" />,      color: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
  swamp:     { label: "Bažiny",   icon: <Wind className="h-3.5 w-3.5" />,     color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  tundra:    { label: "Tundra",   icon: <Snowflake className="h-3.5 w-3.5" />,color: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30" },
};

const AXIAL_NEIGHBORS = [
  { dq: 1, dr: 0 }, { dq: -1, dr: 0 },
  { dq: 0, dr: 1 }, { dq: 0, dr: -1 },
  { dq: 1, dr: -1 }, { dq: -1, dr: 1 },
];

// Axial hex to pixel (pointy-top)
function hexToPixel(q: number, r: number, size: number) {
  const x = size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
  const y = size * (1.5 * r);
  return { x, y };
}

const HEX_SIZE = 52;

const HexMapView = ({ sessionId }: Props) => {
  const [centerQ, setCenterQ] = useState(0);
  const [centerR, setCenterR] = useState(0);
  const [hexes, setHexes] = useState<Record<string, HexData>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [selectedHex, setSelectedHex] = useState<HexData | null>(null);
  const [initialLoaded, setInitialLoaded] = useState(false);

  const hexKey = (q: number, r: number) => `${q},${r}`;

  const fetchHex = useCallback(async (q: number, r: number): Promise<HexData | null> => {
    const key = hexKey(q, r);
    if (hexes[key]) return hexes[key];

    setLoading(prev => ({ ...prev, [key]: true }));
    try {
      const { data, error } = await supabase.functions.invoke("generate-hex", {
        body: { session_id: sessionId, q, r },
      });
      if (error) throw error;
      const hex = data as HexData;
      setHexes(prev => ({ ...prev, [key]: hex }));
      return hex;
    } catch (e) {
      console.error("Hex fetch failed", q, r, e);
      return null;
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }));
    }
  }, [sessionId, hexes]);

  const loadVisibleHexes = useCallback(async (cq: number, cr: number) => {
    const coords = [
      { q: cq, r: cr },
      ...AXIAL_NEIGHBORS.map(n => ({ q: cq + n.dq, r: cr + n.dr })),
    ];
    await Promise.all(coords.map(c => fetchHex(c.q, c.r)));
  }, [fetchHex]);

  const handleLoad = async () => {
    setInitialLoaded(true);
    await loadVisibleHexes(centerQ, centerR);
  };

  const handleHexClick = async (q: number, r: number) => {
    const hex = hexes[hexKey(q, r)] || await fetchHex(q, r);
    if (hex) setSelectedHex(hex);
  };

  const handleNavigate = async (q: number, r: number) => {
    setCenterQ(q);
    setCenterR(r);
    setSelectedHex(null);
    await loadVisibleHexes(q, r);
  };

  // Hexes to render
  const visibleCoords = [
    { q: centerQ, r: centerR },
    ...AXIAL_NEIGHBORS.map(n => ({ q: centerQ + n.dq, r: centerR + n.dr })),
  ];

  // Center of the SVG
  const centerPx = hexToPixel(centerQ, centerR, HEX_SIZE);

  const renderHex = (q: number, r: number) => {
    const key = hexKey(q, r);
    const hex = hexes[key];
    const isLoading = loading[key];
    const isCenter = q === centerQ && r === centerR;
    const pos = hexToPixel(q, r, HEX_SIZE);
    const x = pos.x - centerPx.x;
    const y = pos.y - centerPx.y;

    const biome = hex ? (BIOME_CONFIG[hex.biome_family] || BIOME_CONFIG.plains) : null;

    // Pointy-top hex points
    const points = Array.from({ length: 6 }, (_, i) => {
      const angle = (Math.PI / 180) * (60 * i - 30);
      return `${x + HEX_SIZE * Math.cos(angle)},${y + HEX_SIZE * Math.sin(angle)}`;
    }).join(" ");

    const fillColor = hex
      ? hex.biome_family === "sea" ? "#1e3a5f"
      : hex.biome_family === "mountains" ? "#4a4a4a"
      : hex.biome_family === "forest" ? "#1a4a2a"
      : hex.biome_family === "desert" ? "#5a4a2a"
      : hex.biome_family === "hills" ? "#6a5a3a"
      : hex.biome_family === "swamp" ? "#2a4a3a"
      : hex.biome_family === "tundra" ? "#3a5a6a"
      : "#3a4a2a"
      : "#222";

    return (
      <g key={key} onClick={() => handleHexClick(q, r)} className="cursor-pointer">
        <polygon
          points={points}
          fill={fillColor}
          stroke={isCenter ? "hsl(var(--primary))" : "hsl(var(--border))"}
          strokeWidth={isCenter ? 2.5 : 1}
          opacity={hex ? 1 : 0.4}
          className="transition-opacity hover:opacity-80"
        />
        {isLoading && (
          <text x={x} y={y} textAnchor="middle" dominantBaseline="middle"
            fill="hsl(var(--muted-foreground))" fontSize="10">⏳</text>
        )}
        {hex && !isLoading && (
          <>
            <text x={x} y={y - 14} textAnchor="middle" dominantBaseline="middle"
              fill="white" fontSize="16" style={{ pointerEvents: "none" }}>
              {biome?.icon ? "" : "?"} 
            </text>
            <text x={x} y={y - 12} textAnchor="middle" dominantBaseline="middle"
              fill="white" fontSize="11" fontWeight="600" style={{ pointerEvents: "none" }}>
              {biome?.label || hex.biome_family}
            </text>
            <text x={x} y={y + 4} textAnchor="middle" dominantBaseline="middle"
              fill="hsl(var(--muted-foreground))" fontSize="9" style={{ pointerEvents: "none" }}>
              H:{hex.mean_height}
            </text>
            {hex.coastal && (
              <text x={x} y={y + 16} textAnchor="middle" dominantBaseline="middle"
                fill="#60a5fa" fontSize="8" fontWeight="600" style={{ pointerEvents: "none" }}>
                🌊 Pobřeží
              </text>
            )}
            <text x={x} y={y + 28} textAnchor="middle" dominantBaseline="middle"
              fill="hsl(var(--muted-foreground))" fontSize="7" opacity={0.6} style={{ pointerEvents: "none" }}>
              ({q},{r})
            </text>
          </>
        )}
      </g>
    );
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Hexagon className="h-4 w-4 text-primary" />
        <h3 className="font-display font-semibold text-sm">Mapa světa (Hex View)</h3>
        <Badge variant="outline" className="text-[9px] ml-auto">DEBUG</Badge>
      </div>

      {!initialLoaded ? (
        <div className="game-card p-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Načtěte hex mapu kolem souřadnic ({centerQ}, {centerR})
          </p>
          <Button onClick={handleLoad} variant="outline" className="font-display gap-2">
            <Hexagon className="h-4 w-4" />
            Načíst hex mapu
          </Button>
        </div>
      ) : (
        <div className="game-card p-2 overflow-hidden">
          <svg
            viewBox="-180 -160 360 320"
            className="w-full max-w-[500px] mx-auto"
            style={{ aspectRatio: "360/320" }}
          >
            {visibleCoords.map(c => renderHex(c.q, c.r))}
          </svg>

          <div className="flex justify-center gap-1 mt-2 flex-wrap">
            <Badge variant="outline" className="text-[9px]">
              Střed: ({centerQ}, {centerR})
            </Badge>
            <Badge variant="outline" className="text-[9px]">
              {Object.keys(hexes).length} hexů načteno
            </Badge>
          </div>
        </div>
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
                <InfoRow label="Biom" value={BIOME_CONFIG[selectedHex.biome_family]?.label || selectedHex.biome_family} />
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
                onClick={() => handleNavigate(selectedHex.q, selectedHex.r)}
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

export default HexMapView;
