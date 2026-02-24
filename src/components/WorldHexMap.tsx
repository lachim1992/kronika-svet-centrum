import { useState, useCallback, useEffect, useRef, useMemo, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Hexagon, Map as MapIcon, Eye, Plus, Minus, RefreshCw, Home, Pencil, Swords } from "lucide-react";
import { toast } from "sonner";
import { useHexMap, AXIAL_NEIGHBORS, type HexData } from "@/hooks/useHexMap";
import CityMarkerBadge from "@/components/CityMarkerBadge";

/* ───── Config ───── */
const HEX_SIZE = 38;
const SQRT3 = Math.sqrt(3);

const BIOME_COLORS: Record<string, string> = {
  sea: "#1a3a5c", plains: "#5a7a3a", forest: "#264d2e", hills: "#7a6a42",
  mountains: "#5a5a62", desert: "#b09850", swamp: "#2e4a3c", tundra: "#5a7888",
};
/* Gradient stops for richer biome fills */
const BIOME_GRADIENTS: Record<string, [string, string]> = {
  sea: ["#1a3a5c", "#0f2840"],
  plains: ["#6a8a42", "#4a6a2e"],
  forest: ["#2a5a32", "#1a3a22"],
  hills: ["#8a7a4a", "#5a4a2a"],
  mountains: ["#6a6a72", "#3a3a42"],
  desert: ["#c0a858", "#8a7838"],
  swamp: ["#3a5a48", "#1e3a2a"],
  tundra: ["#6a8898", "#4a6878"],
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

/* ───── City on hex ───── */
interface CityOnHex {
  id: string; name: string; owner_player: string; q: number; r: number;
  settlement_level: string; isCapital?: boolean; imageUrl?: string | null;
  mapIconUrl?: string | null;
  population: number;
}

/* ───── Stack on hex ───── */
interface StackOnHex {
  id: string; name: string; player_name: string; q: number; r: number;
  manpower: number; formation_type: string;
}

/* ───── Props ───── */
interface Props {
  sessionId: string; playerName: string; myRole: string;
  onCityClick?: (cityId: string) => void;
}

/* ───── Memoized hex tile ───── */
const HexTile = memo(({
  q, r, hex, isFrontier, isCurrent, devMode, loading, onClick, offsetX, offsetY, cities, onCityClick, stacks,
  selectedStackId, isMoveTarget, isAttackTarget, onStackClick, onMoveClick, onAttackClick, myPlayerName,
}: {
  q: number; r: number; hex?: HexData; isFrontier: boolean; isCurrent: boolean;
  devMode: boolean; loading: boolean;
  onClick: () => void; offsetX: number; offsetY: number;
  cities: CityOnHex[];
  onCityClick?: (cityId: string) => void;
  stacks: StackOnHex[];
  selectedStackId?: string | null;
  isMoveTarget?: boolean;
  isAttackTarget?: boolean;
  onStackClick?: (stack: StackOnHex) => void;
  onMoveClick?: (q: number, r: number) => void;
  onAttackClick?: (q: number, r: number) => void;
  myPlayerName?: string;
}) => {
  const pos = hexToPixel(q, r);
  const cx = pos.x + offsetX;
  const cy = pos.y + offsetY;
  const pts = hexPoints(cx, cy);
  const isRevealed = !isFrontier;
  const showBiome = isRevealed && hex;
  const showFrontierBiome = isFrontier && hex;
  const fillColor = showBiome ? (BIOME_COLORS[hex.biome_family] || BIOME_COLORS.plains) : FOG_COLOR;

  return (
    <g onClick={isAttackTarget ? () => onAttackClick?.(q, r) : isMoveTarget ? () => onMoveClick?.(q, r) : onClick} className="cursor-pointer">
      {isFrontier && (
        <title>Prozkoumat ({q}, {r})</title>
      )}
      <polygon
        points={pts}
        fill={showBiome ? `url(#biome-grad-${hex.biome_family})` : showFrontierBiome ? `url(#biome-grad-${hex.biome_family})` : FOG_COLOR}
        stroke={isCurrent ? "hsl(45, 90%, 55%)" : isFrontier ? "hsl(var(--primary) / 0.4)" : "hsl(var(--border))"}
        strokeWidth={isCurrent ? 2.5 : isFrontier ? 1.2 : 0.8}
        opacity={showBiome ? 1 : showFrontierBiome ? 0.35 : isFrontier ? 0.25 : 0.3}
        strokeDasharray={isFrontier ? "3,3" : undefined}
        className={isFrontier ? "hover:opacity-60 transition-opacity" : ""}
      />
      {/* Fog overlay for frontier hexes with biome data */}
      {showFrontierBiome && (
        <polygon
          points={pts}
          fill={FOG_COLOR}
          opacity={0.45}
          style={{ pointerEvents: "none" }}
        />
      )}
      {/* Biome texture overlay */}
      {showBiome && (
        <polygon
          points={pts}
          fill={`url(#pat-${hex.biome_family})`}
          style={{ pointerEvents: "none" }}
        />
      )}
      {loading && (
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
          fill="hsl(var(--muted-foreground))" fontSize="10">⏳</text>
      )}
      {showBiome && !loading && (
        <>
          {cities.length > 0 ? (
            <>
              {/* Render up to 3 city markers, stacked */}
              {cities.slice(0, 3).map((c, i) => (
                <CityMarkerBadge
                  key={c.id}
                  cityId={c.id}
                  cityName={c.name}
                  settlementLevel={c.settlement_level}
                  ownerPlayer={c.owner_player}
                  isCapital={c.isCapital}
                  imageUrl={c.imageUrl}
                  mapIconUrl={c.mapIconUrl}
                  population={c.population}
                  size="md"
                  cx={cx + (i > 0 ? (i === 1 ? -8 : 8) : 0)}
                  cy={cy + (i > 0 ? 6 : 0)}
                  onClick={() => onCityClick?.(c.id)}
                />
              ))}
              {cities.length > 3 && (
                <text x={cx + 14} y={cy + 18} textAnchor="middle" dominantBaseline="middle"
                  fill="white" fontSize="7" fontWeight="700" style={{ pointerEvents: "none" }}>
                  +{cities.length - 3}
                </text>
              )}
            </>
          ) : (
            <>
              <text x={cx} y={cy - 8} textAnchor="middle" dominantBaseline="middle"
                fill="white" fontSize="9" fontWeight="600" style={{ pointerEvents: "none" }}>
                {BIOME_LABELS[hex.biome_family] || hex.biome_family}
              </text>
              <text x={cx} y={cy + 4} textAnchor="middle" dominantBaseline="middle"
                fill="hsl(var(--muted-foreground))" fontSize="7" style={{ pointerEvents: "none" }}>
                H:{hex.mean_height}
              </text>
            </>
          )}
          {hex.coastal && cities.length === 0 && (
            <text x={cx} y={cy + 14} textAnchor="middle" dominantBaseline="middle"
              fill="#60a5fa" fontSize="7" style={{ pointerEvents: "none" }}>🌊</text>
          )}
          {devMode && (
            <text x={cx} y={cy + 22} textAnchor="middle" dominantBaseline="middle"
              fill="hsl(var(--muted-foreground))" fontSize="6" opacity={0.5} style={{ pointerEvents: "none" }}>
              ({q},{r})
            </text>
          )}
          {/* Army markers */}
          {stacks.length > 0 && (
            <>
              {stacks.slice(0, 3).map((s, i) => {
                const isOwn = s.player_name === myPlayerName;
                const isSelected = s.id === selectedStackId;
                const yOff = cities.length > 0 ? 20 : 14;
                return (
                  <g key={s.id} className="cursor-pointer" onClick={(e) => {
                    e.stopPropagation();
                    if (isOwn && onStackClick) onStackClick(s);
                  }}>
                    <rect
                      x={cx - 14 + i * 4} y={cy + yOff - 5}
                      width="28" height="10" rx="3"
                      fill={isSelected ? "hsl(45, 90%, 20%)" : "hsl(0, 0%, 10%)"} fillOpacity="0.85"
                      stroke={isSelected ? "hsl(45, 90%, 65%)" : isOwn ? "hsl(45, 80%, 55%)" : "hsl(0, 60%, 55%)"}
                      strokeWidth={isSelected ? 1.8 : 0.8}
                    />
                    <text x={cx + i * 4} y={cy + yOff + 1}
                      textAnchor="middle" dominantBaseline="middle"
                      fill={isOwn ? "hsl(45, 80%, 60%)" : "hsl(0, 60%, 65%)"} fontSize="6" fontWeight="700"
                      style={{ pointerEvents: "none" }}>
                      ⚔ {s.manpower}
                    </text>
                  </g>
                );
              })}
              {stacks.length > 3 && (
                <text x={cx + 16} y={cy + (cities.length > 0 ? 22 : 16)}
                  textAnchor="middle" dominantBaseline="middle"
                  fill="hsl(45, 80%, 60%)" fontSize="6" fontWeight="700" style={{ pointerEvents: "none" }}>
                  +{stacks.length - 3}
                </text>
              )}
            </>
          )}
          {/* Move target overlay */}
          {isMoveTarget && (
            <>
              <polygon
                points={pts}
                fill="hsl(120, 60%, 40%)"
                opacity={0.2}
                style={{ pointerEvents: "none" }}
              />
              <polygon
                points={pts}
                fill="none"
                stroke="hsl(120, 70%, 50%)"
                strokeWidth={2}
                strokeDasharray="4,3"
                opacity={0.7}
                style={{ pointerEvents: "none" }}
              />
              <text x={cx} y={cy + (cities.length > 0 ? -16 : 16)} textAnchor="middle" dominantBaseline="middle"
                fill="hsl(120, 70%, 60%)" fontSize="7" fontWeight="700" style={{ pointerEvents: "none" }}>
                ↗ Přesun
              </text>
            </>
          )}
          {/* Attack target overlay */}
          {isAttackTarget && (
            <>
              <polygon
                points={pts}
                fill="hsl(0, 70%, 40%)"
                opacity={0.25}
                style={{ pointerEvents: "none" }}
              />
              <polygon
                points={pts}
                fill="none"
                stroke="hsl(0, 80%, 55%)"
                strokeWidth={2}
                strokeDasharray="4,3"
                opacity={0.8}
                style={{ pointerEvents: "none" }}
              />
              <text x={cx} y={cy + (cities.length > 0 ? -16 : 16)} textAnchor="middle" dominantBaseline="middle"
                fill="hsl(0, 80%, 65%)" fontSize="7" fontWeight="700" style={{ pointerEvents: "none" }}>
                ⚔ Útok
              </text>
            </>
          )}
        </>
      )}
      {isFrontier && !loading && (
        <>
          <text x={cx} y={cy - 4} textAnchor="middle" dominantBaseline="middle"
            fill="hsl(var(--primary))" fontSize="12" opacity={0.7} style={{ pointerEvents: "none" }}>?</text>
          <text x={cx} y={cy + 8} textAnchor="middle" dominantBaseline="middle"
            fill="hsl(var(--primary))" fontSize="5.5" opacity={0.5} style={{ pointerEvents: "none" }}>
            Prozkoumat
          </text>
        </>
      )}
    </g>
  );
});
HexTile.displayName = "HexTile";

/* ───── Main component ───── */
const WorldHexMap = ({ sessionId, playerName, myRole, onCityClick }: Props) => {
  const isAdmin = myRole === "admin";
  const [devMode, setDevMode] = useState(isAdmin);
  const [selectedHex, setSelectedHex] = useState<HexData | null>(null);
  const [editBiome, setEditBiome] = useState<string | null>(null);
  const [savingBiome, setSavingBiome] = useState(false);
  const [discoveredIds, setDiscoveredIds] = useState<Set<string>>(new Set());
  const [discoveredCoords, setDiscoveredCoords] = useState<Set<string>>(new Set());
  const [exploring, setExploring] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [currentPos, setCurrentPos] = useState<{ q: number; r: number } | null>(null);
  const [playerCities, setPlayerCities] = useState<CityOnHex[]>([]);
  const [allCities, setAllCities] = useState<CityOnHex[]>([]);
  const [allStacks, setAllStacks] = useState<StackOnHex[]>([]);
  const [selectedStack, setSelectedStack] = useState<StackOnHex | null>(null);
  const [movingStack, setMovingStack] = useState(false);
  const [battleTarget, setBattleTarget] = useState<{ q: number; r: number } | null>(null);
  const [battleSpeech, setBattleSpeech] = useState("");
  const [speechResult, setSpeechResult] = useState<{ morale_modifier: number; ai_feedback: string } | null>(null);
  const [evaluatingSpeech, setEvaluatingSpeech] = useState(false);
  const [submittingBattle, setSubmittingBattle] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);

  // Pan state
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number; moved: boolean } | null>(null);

  const { hexes, getHex, isLoading, fetchHex, loadHexesByIds, loadAllGenerated } = useHexMap(sessionId);

  /* ── Load cities with province coordinates ── */
  const fetchCities = useCallback(async () => {
    const [{ data }, { data: images }, { data: mapIcons }] = await Promise.all([
      supabase
        .from("cities")
        .select("id, name, owner_player, province_q, province_r, settlement_level, population_total")
        .eq("session_id", sessionId)
        .not("province_q", "is", null)
        .not("province_r", "is", null),
      supabase
        .from("encyclopedia_images")
        .select("entity_id, image_url")
        .eq("session_id", sessionId)
        .eq("entity_type", "city")
        .eq("is_primary", true),
      supabase
        .from("encyclopedia_images")
        .select("entity_id, image_url")
        .eq("session_id", sessionId)
        .eq("entity_type", "city")
        .eq("kind", "map_icon"),
    ]);
    if (data) {
      // Build image lookups
      const imgMap = new Map<string, string>();
      for (const img of images || []) {
        imgMap.set(img.entity_id, img.image_url);
      }
      const iconMap = new Map<string, string>();
      for (const icon of mapIcons || []) {
        iconMap.set(icon.entity_id, icon.image_url);
      }

      // Determine capital: first CITY-level or first city per player
      const capitalIds = new Set<string>();
      const byPlayer = new Map<string, typeof data>();
      for (const c of data) {
        const list = byPlayer.get(c.owner_player) || [];
        list.push(c);
        byPlayer.set(c.owner_player, list);
      }
      for (const [, pCities] of byPlayer) {
        const capital = pCities.find(c => c.settlement_level === "CITY") || pCities[0];
        if (capital) capitalIds.add(capital.id);
      }

      const mapped: CityOnHex[] = data.map(c => ({
        id: c.id, name: c.name, owner_player: c.owner_player,
        q: c.province_q!, r: c.province_r!,
        settlement_level: c.settlement_level,
        isCapital: capitalIds.has(c.id),
        imageUrl: imgMap.get(c.id) || null,
        mapIconUrl: iconMap.get(c.id) || null,
        population: c.population_total || 1000,
      }));
      setAllCities(mapped);
      setPlayerCities(mapped.filter(c => c.owner_player === playerName));
    }
  }, [sessionId, playerName]);

  /* ── Fetch deployed military stacks ── */
  const fetchStacks = useCallback(async () => {
    const { data: rawStacks } = await supabase
      .from("military_stacks")
      .select("id, name, player_name, hex_q, hex_r, formation_type, is_deployed, is_active")
      .eq("session_id", sessionId)
      .eq("is_deployed", true)
      .eq("is_active", true);
    if (!rawStacks || rawStacks.length === 0) { setAllStacks([]); return; }
    const stackIds = rawStacks.map(s => s.id);
    const { data: comps } = await supabase
      .from("military_stack_composition")
      .select("stack_id, manpower")
      .in("stack_id", stackIds);
    const mpMap = new Map<string, number>();
    for (const c of comps || []) {
      mpMap.set(c.stack_id, (mpMap.get(c.stack_id) || 0) + c.manpower);
    }
    setAllStacks(rawStacks.map(s => ({
      id: s.id, name: s.name, player_name: s.player_name,
      q: s.hex_q ?? 0, r: s.hex_r ?? 0,
      manpower: mpMap.get(s.id) || 0,
      formation_type: s.formation_type,
    })));
  }, [sessionId]);

  /* ── City lookup by coords — supports multiple cities per hex ── */
  const citiesByCoord = useMemo(() => {
    const visible = allCities.filter(c =>
      c.owner_player === playerName || isAdmin || discoveredCoords.has(hKey(c.q, c.r))
    );
    const m = new Map<string, CityOnHex[]>();
    for (const c of visible) {
      const key = hKey(c.q, c.r);
      const list = m.get(key) || [];
      list.push(c);
      m.set(key, list);
    }
    return m;
  }, [allCities, playerName, isAdmin, discoveredCoords]);

  /* ── Stack lookup by coords ── */
  const stacksByCoord = useMemo(() => {
    const visible = allStacks.filter(s =>
      s.player_name === playerName || isAdmin || discoveredCoords.has(hKey(s.q, s.r))
    );
    const m = new Map<string, StackOnHex[]>();
    for (const s of visible) {
      const key = hKey(s.q, s.r);
      const list = m.get(key) || [];
      list.push(s);
      m.set(key, list);
    }
    return m;
  }, [allStacks, playerName, isAdmin, discoveredCoords]);

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
    if (isAdmin && !devMode) return new Set<string>();
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

  /* ── Auto-fetch frontier hex data so terrain is visible ── */
  const frontierFetchedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (frontierCoords.size === 0) return;
    const toFetch: { q: number; r: number }[] = [];
    for (const fk of frontierCoords) {
      if (frontierFetchedRef.current.has(fk)) continue;
      if (getHex(...fk.split(",").map(Number) as [number, number])) continue;
      toFetch.push({ q: Number(fk.split(",")[0]), r: Number(fk.split(",")[1]) });
      frontierFetchedRef.current.add(fk);
    }
    if (toFetch.length === 0) return;
    // Fetch in batches to avoid overwhelming
    const batch = toFetch.slice(0, 20);
    Promise.all(batch.map(c => fetchHex(c.q, c.r)));
  }, [frontierCoords, getHex, fetchHex]);

  /* ── All tiles to render ── */
  const renderCoords = useMemo(() => {
    const all = new Map<string, { q: number; r: number; isFrontier: boolean }>();

    if (isAdmin && devMode) {
      for (const key of Object.keys(hexes)) {
        const [q, r] = key.split(",").map(Number);
        all.set(key, { q, r, isFrontier: false });
      }
      for (const fk of frontierCoords) {
        if (!all.has(fk)) {
          const [q, r] = fk.split(",").map(Number);
          all.set(fk, { q, r, isFrontier: true });
        }
      }
    } else {
      for (const coordStr of discoveredCoords) {
        const [q, r] = coordStr.split(",").map(Number);
        all.set(coordStr, { q, r, isFrontier: false });
      }
      for (const fk of frontierCoords) {
        const [q, r] = fk.split(",").map(Number);
        all.set(fk, { q, r, isFrontier: true });
      }
    }
    return Array.from(all.values());
  }, [hexes, discoveredCoords, frontierCoords, isAdmin, devMode]);

  /* ── Camera center on player capital ── */
  const cameraCenter = useMemo(() => {
    // Center on current position if set
    if (currentPos) return hexToPixel(currentPos.q, currentPos.r);
    // Center on capital (first city)
    if (playerCities.length > 0) return hexToPixel(playerCities[0].q, playerCities[0].r);
    // Fallback to average of discovered
    if (discoveredCoords.size === 0) return { x: 0, y: 0 };
    let sx = 0, sy = 0, n = 0;
    for (const coordStr of discoveredCoords) {
      const [q, r] = coordStr.split(",").map(Number);
      const p = hexToPixel(q, r);
      sx += p.x; sy += p.y; n++;
    }
    return { x: sx / n, y: sy / n };
  }, [currentPos, playerCities, discoveredCoords]);

  /* ── Bootstrap: discover player's city hexes on load ── */
  const bootstrapCityDiscoveries = useCallback(async (cities: CityOnHex[]) => {
    if (cities.length === 0 || bootstrapping) return;
    setBootstrapping(true);
    try {
      for (const city of cities) {
        // Use explore-hex which handles get-or-generate + discovery insert
        await supabase.functions.invoke("explore-hex", {
          body: { session_id: sessionId, player_name: playerName, q: city.q, r: city.r },
        });
      }
      await fetchDiscoveries();
      // Set current position to capital
      setCurrentPos({ q: cities[0].q, r: cities[0].r });
    } catch (e: any) {
      console.error("Bootstrap failed", e);
    } finally {
      setBootstrapping(false);
    }
  }, [sessionId, playerName, fetchDiscoveries, bootstrapping]);

  /* ── Initial load ── */
  const handleLoadMap = useCallback(async () => {
    setMapLoaded(true);
    await Promise.all([fetchCities(), fetchStacks()]);
    if (isAdmin) {
      await loadAllGenerated();
    }
    await fetchDiscoveries();
  }, [isAdmin, loadAllGenerated, fetchDiscoveries, fetchCities, fetchStacks]);

  // After discoveries + cities load, bootstrap if needed
  useEffect(() => {
    if (!mapLoaded || bootstrapping) return;
    if (discoveredIds.size === 0 && playerCities.length > 0) {
      bootstrapCityDiscoveries(playerCities);
    } else if (discoveredIds.size > 0 && currentPos === null && playerCities.length > 0) {
      // Set initial position to capital
      setCurrentPos({ q: playerCities[0].q, r: playerCities[0].r });
    }
  }, [mapLoaded, discoveredIds.size, playerCities, currentPos, bootstrapping, bootstrapCityDiscoveries]);

  /* ── DEV debug log ── */
  const [debugLog, setDebugLog] = useState<{ q: number; r: number; type: string; status: number; message: string } | null>(null);

  /* ── Explore frontier tile (server-validated) ── */
  const handleExploreFrontier = useCallback(async (q: number, r: number) => {
    const key = hKey(q, r);
    setExploring(key);
    setDebugLog(null);
    try {
      const { data, error } = await supabase.functions.invoke("explore-hex", {
        body: { session_id: sessionId, player_name: playerName, q, r },
      });
      if (error) {
        setDebugLog({ q, r, type: "frontier", status: 500, message: error.message || "invoke error" });
        throw error;
      }
      if (data?.error) {
        setDebugLog({ q, r, type: "frontier", status: 403, message: data.error });
        toast.error(data.error);
        return;
      }
      setDebugLog({ q, r, type: "frontier", status: 200, message: "OK" });
      await fetchDiscoveries();
      await fetchCities();
      toast.success(`Provincie (${q}, ${r}) objevena!`);
    } catch (e: any) {
      toast.error("Průzkum selhal: " + (e.message || "neznámá chyba"));
    } finally {
      setExploring(null);
    }
  }, [sessionId, playerName, fetchDiscoveries, fetchCities]);

  /* ── Move to discovered hex ── */
  const handleMoveToHex = useCallback((q: number, r: number) => {
    setCurrentPos({ q, r });
    toast.success(`Přesun na (${q}, ${r})`);
  }, []);

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
      if (isAdmin) await loadAllGenerated();
      await fetchDiscoveries();
      toast.success(`Přepočteno ${updated.length} hexů`);
    } catch (e: any) {
      toast.error("Chyba: " + (e.message || "neznámá"));
    } finally {
      setRecomputing(false);
    }
  }, [hexes, sessionId, isAdmin, loadAllGenerated, fetchDiscoveries]);

  /* ── Save biome change ── */
  const handleSaveBiome = useCallback(async () => {
    if (!selectedHex || !editBiome || editBiome === selectedHex.biome_family) return;
    setSavingBiome(true);
    try {
      const { error } = await supabase
        .from("province_hexes")
        .update({ biome_family: editBiome })
        .eq("id", selectedHex.id);
      if (error) throw error;
      // Refresh hex data
      if (isAdmin) await loadAllGenerated();
      else await fetchDiscoveries();
      toast.success(`Biom změněn na ${BIOME_LABELS[editBiome] || editBiome}`);
      setSelectedHex(null);
      setEditBiome(null);
    } catch (e: any) {
      toast.error("Chyba: " + (e.message || "neznámá"));
    } finally {
      setSavingBiome(false);
    }
  }, [selectedHex, editBiome, isAdmin, loadAllGenerated, fetchDiscoveries]);


  /* ── Move targets for selected stack ── */
  const moveTargetCoords = useMemo(() => {
    if (!selectedStack) return new Set<string>();
    const targets = new Set<string>();
    for (const n of AXIAL_NEIGHBORS) {
      const nk = hKey(selectedStack.q + n.dq, selectedStack.r + n.dr);
      // Can move to discovered hexes that are not sea
      if (discoveredCoords.has(nk) || (isAdmin && devMode)) {
        const hex = getHex(selectedStack.q + n.dq, selectedStack.r + n.dr);
        if (hex && hex.biome_family !== "sea") targets.add(nk);
      }
    }
    return targets;
  }, [selectedStack, discoveredCoords, isAdmin, devMode, getHex]);

  /* ── Attack targets for selected stack (enemy cities/stacks on adjacent hexes) ── */
  const attackTargetCoords = useMemo(() => {
    if (!selectedStack) return new Set<string>();
    const targets = new Set<string>();
    for (const n of AXIAL_NEIGHBORS) {
      const nq = selectedStack.q + n.dq;
      const nr = selectedStack.r + n.dr;
      const nk = hKey(nq, nr);
      // Check if there's an enemy city or enemy stack on this hex
      const hexCities = citiesByCoord.get(nk) || [];
      const hexStacks = stacksByCoord.get(nk) || [];
      const hasEnemyCity = hexCities.some(c => c.owner_player !== playerName);
      const hasEnemyStack = hexStacks.some(s => s.player_name !== playerName);
      if (hasEnemyCity || hasEnemyStack) targets.add(nk);
    }
    return targets;
  }, [selectedStack, citiesByCoord, stacksByCoord, playerName]);

  /* ── Handle stack selection ── */
  const handleStackClick = useCallback((stack: StackOnHex) => {
    if (dragRef.current?.moved) return;
    if (stack.player_name !== playerName) return;
    setSelectedStack(prev => prev?.id === stack.id ? null : stack);
  }, [playerName]);

  /* ── Handle move to hex ── */
  const handleMoveStackToHex = useCallback(async (targetQ: number, targetR: number) => {
    if (!selectedStack || movingStack) return;
    // Check if already moved this turn
    const { data: stackData } = await supabase
      .from("military_stacks")
      .select("moved_this_turn")
      .eq("id", selectedStack.id)
      .single();
    if (stackData?.moved_this_turn) {
      toast.error("Tato jednotka se již tento tah přesunula!");
      return;
    }
    setMovingStack(true);
    try {
      const { error } = await supabase
        .from("military_stacks")
        .update({ hex_q: targetQ, hex_r: targetR, moved_this_turn: true })
        .eq("id", selectedStack.id);
      if (error) throw error;
      toast.success(`${selectedStack.name} přesunuta na (${targetQ}, ${targetR})`);
      setSelectedStack(null);
      await fetchStacks();
    } catch (e: any) {
      toast.error("Přesun selhal: " + (e.message || "neznámá chyba"));
    } finally {
      setMovingStack(false);
    }
  }, [selectedStack, movingStack, fetchStacks]);

  /* ── Handle attack target click ── */
  const handleAttackClick = useCallback((q: number, r: number) => {
    if (dragRef.current?.moved) return;
    if (!selectedStack) return;
    setBattleTarget({ q, r });
    setBattleSpeech("");
    setSpeechResult(null);
  }, [selectedStack]);

  /* ── Evaluate battle speech ── */
  const handleEvaluateSpeech = useCallback(async () => {
    if (!battleSpeech.trim() || !selectedStack || !battleTarget) return;
    setEvaluatingSpeech(true);
    try {
      const hexCities = citiesByCoord.get(hKey(battleTarget.q, battleTarget.r)) || [];
      const hexStacks = stacksByCoord.get(hKey(battleTarget.q, battleTarget.r)) || [];
      const enemyCity = hexCities.find(c => c.owner_player !== playerName);
      const enemyStack = hexStacks.find(s => s.player_name !== playerName);
      const defName = enemyCity?.name || enemyStack?.name || "nepřítel";

      const { data, error } = await supabase.functions.invoke("battle-speech", {
        body: {
          speech_text: battleSpeech,
          attacker_name: selectedStack.name,
          defender_name: defName,
          biome: "plains",
          attacker_morale: 70,
        },
      });
      if (error) throw error;
      setSpeechResult(data);
      toast.success(`Proslov: ${data.morale_modifier >= 0 ? "+" : ""}${data.morale_modifier} morálka`);
    } catch {
      toast.error("Chyba proslovu");
    }
    setEvaluatingSpeech(false);
  }, [battleSpeech, selectedStack, battleTarget, citiesByCoord, stacksByCoord, playerName]);

  /* ── Submit battle from map ── */
  const handleSubmitBattle = useCallback(async () => {
    if (!selectedStack || !battleTarget) return;
    setSubmittingBattle(true);
    try {
      const hexCities = citiesByCoord.get(hKey(battleTarget.q, battleTarget.r)) || [];
      const hexStacks = stacksByCoord.get(hKey(battleTarget.q, battleTarget.r)) || [];
      const enemyCity = hexCities.find(c => c.owner_player !== playerName);
      const enemyStack = hexStacks.find(s => s.player_name !== playerName);

      const seed = Date.now() + Math.floor(Math.random() * 100000);
      const { data: session } = await supabase.from("game_sessions").select("current_turn").eq("id", sessionId).single();
      const turn = session?.current_turn || 1;

      await supabase.from("action_queue").insert({
        session_id: sessionId,
        player_name: playerName,
        action_type: "battle",
        status: "pending",
        action_data: {
          attacker_stack_id: selectedStack.id,
          defender_city_id: enemyCity?.id || null,
          defender_stack_id: enemyStack?.id || null,
          speech_text: battleSpeech || null,
          speech_morale_modifier: speechResult?.morale_modifier || 0,
          seed,
        },
        execute_on_turn: turn,
        completes_at: new Date().toISOString(),
      });
      toast.success("Bitva zahájena!");
      setBattleTarget(null);
      setSelectedStack(null);
      await fetchStacks();
    } catch (e: any) {
      toast.error("Chyba: " + (e.message || "neznámá"));
    }
    setSubmittingBattle(false);
  }, [selectedStack, battleTarget, citiesByCoord, stacksByCoord, playerName, sessionId, battleSpeech, speechResult, fetchStacks]);

  const handleTileClick = useCallback((q: number, r: number, isFrontier: boolean) => {
    if (dragRef.current?.moved) return;
    if (isFrontier) {
      handleExploreFrontier(q, r);
    } else {
      // If stack selected, deselect on non-move-target click
      if (selectedStack) {
        setSelectedStack(null);
        return;
      }
      handleMoveToHex(q, r);
    }
  }, [handleExploreFrontier, handleMoveToHex, selectedStack]);

  /* ── Long-press / detail on discovered hex ── */
  const handleTileContextMenu = useCallback((q: number, r: number, isFrontier: boolean) => {
    if (isFrontier) return;
    const hex = getHex(q, r);
    if (hex) setSelectedHex(hex);
  }, [getHex]);

  /* ── SVG layout ── */
  const svgW = 1100;
  const svgH = 700;
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
          {bootstrapping && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground p-2 rounded-lg border border-border bg-card">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Objevuji provincie vašich měst…
            </div>
          )}

          <div
            className="game-card p-0 overflow-hidden relative select-none touch-none"
            style={{ height: "520px" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onWheel={onWheel}
          >
            <svg width="100%" height="100%" viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="xMidYMid meet">
              <defs>
                {/* Biome gradients */}
                {Object.entries(BIOME_GRADIENTS).map(([biome, [c1, c2]]) => (
                  <radialGradient key={`grad-${biome}`} id={`biome-grad-${biome}`} cx="50%" cy="40%" r="70%">
                    <stop offset="0%" stopColor={c1} />
                    <stop offset="100%" stopColor={c2} />
                  </radialGradient>
                ))}

                {/* Sea waves pattern */}
                <pattern id="pat-sea" patternUnits="userSpaceOnUse" width="20" height="12" patternTransform="rotate(-15)">
                  <path d="M0 6 Q5 3 10 6 Q15 9 20 6" fill="none" stroke="#2a5a8a" strokeWidth="0.8" opacity="0.4" />
                  <path d="M0 10 Q5 7 10 10 Q15 13 20 10" fill="none" stroke="#2a5a8a" strokeWidth="0.5" opacity="0.25" />
                </pattern>

                {/* Forest tree pattern */}
                <pattern id="pat-forest" patternUnits="userSpaceOnUse" width="14" height="14">
                  <circle cx="4" cy="4" r="2.5" fill="#1a4a22" opacity="0.5" />
                  <circle cx="11" cy="10" r="3" fill="#1e5528" opacity="0.45" />
                  <circle cx="7" cy="12" r="2" fill="#1a4020" opacity="0.35" />
                </pattern>

                {/* Hills contour pattern */}
                <pattern id="pat-hills" patternUnits="userSpaceOnUse" width="24" height="16" patternTransform="rotate(5)">
                  <path d="M0 12 Q6 6 12 12 Q18 6 24 12" fill="none" stroke="#5a4a2a" strokeWidth="0.7" opacity="0.35" />
                  <path d="M-4 8 Q4 2 12 8" fill="none" stroke="#6a5a3a" strokeWidth="0.5" opacity="0.2" />
                </pattern>

                {/* Mountains peak pattern */}
                <pattern id="pat-mountains" patternUnits="userSpaceOnUse" width="20" height="18">
                  <path d="M2 18 L10 4 L18 18" fill="none" stroke="#8a8a92" strokeWidth="0.9" opacity="0.35" />
                  <path d="M8 18 L13 8 L18 18" fill="none" stroke="#7a7a82" strokeWidth="0.6" opacity="0.25" />
                  <path d="M8 6 L10 4 L12 6" fill="#aab0b8" opacity="0.3" />
                </pattern>

                {/* Desert dune pattern */}
                <pattern id="pat-desert" patternUnits="userSpaceOnUse" width="28" height="14" patternTransform="rotate(-8)">
                  <path d="M0 10 Q7 4 14 10 Q21 4 28 10" fill="none" stroke="#d0b868" strokeWidth="0.8" opacity="0.35" />
                  <circle cx="8" cy="5" r="0.5" fill="#e0c870" opacity="0.4" />
                  <circle cx="22" cy="8" r="0.4" fill="#e0c870" opacity="0.3" />
                </pattern>

                {/* Swamp reeds pattern */}
                <pattern id="pat-swamp" patternUnits="userSpaceOnUse" width="16" height="16">
                  <line x1="4" y1="14" x2="4" y2="6" stroke="#4a6a50" strokeWidth="0.6" opacity="0.4" />
                  <line x1="8" y1="14" x2="9" y2="4" stroke="#4a6a50" strokeWidth="0.5" opacity="0.3" />
                  <line x1="12" y1="14" x2="12" y2="8" stroke="#3a5a44" strokeWidth="0.6" opacity="0.35" />
                  <circle cx="6" cy="12" r="1.5" fill="#3a5a44" opacity="0.2" />
                </pattern>

                {/* Tundra snow/frost pattern */}
                <pattern id="pat-tundra" patternUnits="userSpaceOnUse" width="18" height="18">
                  <circle cx="4" cy="4" r="0.8" fill="#a0c0d0" opacity="0.35" />
                  <circle cx="14" cy="8" r="0.6" fill="#b0d0e0" opacity="0.3" />
                  <circle cx="8" cy="15" r="0.7" fill="#a0c0d0" opacity="0.25" />
                  <circle cx="16" cy="16" r="0.5" fill="#b0d0e0" opacity="0.2" />
                </pattern>

                {/* Plains grass pattern */}
                <pattern id="pat-plains" patternUnits="userSpaceOnUse" width="16" height="12" patternTransform="rotate(10)">
                  <line x1="3" y1="10" x2="4" y2="5" stroke="#7a9a4a" strokeWidth="0.5" opacity="0.3" />
                  <line x1="8" y1="11" x2="8" y2="6" stroke="#6a8a3a" strokeWidth="0.4" opacity="0.25" />
                  <line x1="13" y1="10" x2="12" y2="4" stroke="#7a9a4a" strokeWidth="0.5" opacity="0.3" />
                </pattern>
              </defs>
              <g transform={`translate(${pan.x / zoom}, ${pan.y / zoom}) scale(${zoom})`}>
                {renderCoords.map(c => {
                  const hex = getHex(c.q, c.r);
                  const isCurrent = currentPos !== null && c.q === currentPos.q && c.r === currentPos.r && !c.isFrontier;
                  const hexCities = citiesByCoord.get(hKey(c.q, c.r)) || [];
                  return (
                    <HexTile
                      key={hKey(c.q, c.r)}
                      q={c.q} r={c.r}
                      hex={hex}
                      isFrontier={c.isFrontier}
                      isCurrent={isCurrent}
                      devMode={devMode}
                      loading={isLoading(c.q, c.r) || exploring === hKey(c.q, c.r)}
                      onClick={() => handleTileClick(c.q, c.r, c.isFrontier)}
                      offsetX={offsetX}
                      offsetY={offsetY}
                      cities={hexCities}
                      onCityClick={onCityClick}
                      stacks={stacksByCoord.get(hKey(c.q, c.r)) || []}
                      selectedStackId={selectedStack?.id}
                      isMoveTarget={moveTargetCoords.has(hKey(c.q, c.r))}
                      isAttackTarget={attackTargetCoords.has(hKey(c.q, c.r))}
                      onStackClick={handleStackClick}
                      onMoveClick={handleMoveStackToHex}
                      onAttackClick={handleAttackClick}
                      myPlayerName={playerName}
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

            {/* Current position indicator */}
            {currentPos && (
              <div className="absolute top-2 left-2 z-10">
                <Badge variant="secondary" className="text-[9px] gap-1">
                  📍 ({currentPos.q}, {currentPos.r})
                  {(citiesByCoord.get(hKey(currentPos.q, currentPos.r)) || []).length > 0 && (
                    <span className="ml-1">— {citiesByCoord.get(hKey(currentPos.q, currentPos.r))![0].name}</span>
                  )}
                </Badge>
              </div>
            )}

            {/* Selected unit panel */}
            {selectedStack && (
              <div className="absolute bottom-2 left-2 z-10 p-2 rounded-lg border border-primary/40 bg-card/90 backdrop-blur-sm max-w-[200px]">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs">⚔️</span>
                  <span className="text-[10px] font-display font-bold text-foreground truncate">{selectedStack.name}</span>
                </div>
                <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                  <span>👥 {selectedStack.manpower}</span>
                  <span>📍 ({selectedStack.q},{selectedStack.r})</span>
                </div>
                <p className="text-[8px] mt-1">
                  <span className="text-primary">Zelený hex = přesun</span>
                  {attackTargetCoords.size > 0 && <span className="text-destructive"> · Červený = útok</span>}
                </p>
                {movingStack && (
                  <div className="flex items-center gap-1 mt-1">
                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                    <span className="text-[9px] text-muted-foreground">Přesouvám…</span>
                  </div>
                )}
                <Button size="sm" variant="ghost" className="h-5 text-[9px] mt-1 w-full"
                  onClick={() => setSelectedStack(null)}>
                  Zrušit výběr
                </Button>
              </div>
            )}

            {renderCoords.length === 0 && !bootstrapping && (
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
            {playerCities.length > 0 && (
              <Badge variant="outline" className="text-[9px] gap-1">
                <Home className="h-3 w-3" />
                {playerCities.length} měst na mapě
              </Badge>
            )}
            <p className="text-[10px] text-muted-foreground ml-auto italic">
              Klikněte na ? hex pro průzkum · na ⚔ jednotku pro výběr a přesun
            </p>
          </div>

          {/* DEV debug panel */}
          {devMode && debugLog && (
            <div className="p-2 rounded-lg border border-border bg-card text-[10px] font-mono space-y-0.5">
              <p className="font-display font-semibold text-xs text-muted-foreground">🔧 DEV — Poslední průzkum</p>
              <p>Souřadnice: ({debugLog.q}, {debugLog.r}) — Typ: {debugLog.type}</p>
              <p>Status: <span className={debugLog.status === 200 ? "text-green-400" : "text-red-400"}>{debugLog.status}</span> — {debugLog.message}</p>
            </div>
          )}
        </>
      )}

      {/* Province detail modal */}
      <Dialog open={!!selectedHex} onOpenChange={(open) => { if (!open) { setSelectedHex(null); setEditBiome(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Hexagon className="h-5 w-5 text-primary" />
              Provincie ({selectedHex?.q}, {selectedHex?.r})
              {selectedHex && (citiesByCoord.get(hKey(selectedHex.q, selectedHex.r)) || []).length > 0 && (
                <Badge variant="secondary" className="text-[9px] ml-2">
                  🏰 {citiesByCoord.get(hKey(selectedHex.q, selectedHex.r))![0].name}
                </Badge>
              )}
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

              {/* Biome editor */}
              {isAdmin && (
                <div className="p-3 rounded-lg border border-primary/30 bg-primary/5 space-y-2">
                  <p className="text-xs font-display font-semibold flex items-center gap-1.5">
                    <Pencil className="h-3 w-3 text-primary" /> Změnit biom
                  </p>
                  <div className="flex gap-2">
                    <Select
                      value={editBiome ?? selectedHex.biome_family}
                      onValueChange={setEditBiome}
                    >
                      <SelectTrigger className="h-8 text-xs flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(BIOME_LABELS).map(([key, label]) => (
                          <SelectItem key={key} value={key} className="text-xs">
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      className="h-8 text-xs gap-1"
                      disabled={savingBiome || !editBiome || editBiome === selectedHex.biome_family}
                      onClick={handleSaveBiome}
                    >
                      {savingBiome ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      Uložit
                    </Button>
                  </div>
                </div>
              )}

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
                variant="outline" size="sm" className="w-full font-display text-xs"
                onClick={() => {
                  setCurrentPos({ q: selectedHex.q, r: selectedHex.r });
                  setSelectedHex(null);
                  setEditBiome(null);
                  toast.success(`Přesun na (${selectedHex.q}, ${selectedHex.r})`);
                }}
              >
                📍 Přesunout se sem
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Battle initiation dialog from map */}
      <Dialog open={!!battleTarget} onOpenChange={(open) => { if (!open) { setBattleTarget(null); setSpeechResult(null); setBattleSpeech(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Swords className="h-5 w-5 text-destructive" />
              Zahájit bitvu
            </DialogTitle>
          </DialogHeader>
          {battleTarget && selectedStack && (() => {
            const hexCities = citiesByCoord.get(hKey(battleTarget.q, battleTarget.r)) || [];
            const hexStacks = stacksByCoord.get(hKey(battleTarget.q, battleTarget.r)) || [];
            const enemyCity = hexCities.find(c => c.owner_player !== playerName);
            const enemyStack = hexStacks.find(s => s.player_name !== playerName);
            return (
              <div className="space-y-3">
                <div className="p-3 rounded-lg border border-border bg-card space-y-1">
                  <p className="text-xs font-display font-semibold">Útočník</p>
                  <p className="text-sm">⚔ {selectedStack.name} ({selectedStack.manpower} mužů)</p>
                </div>
                <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/5 space-y-1">
                  <p className="text-xs font-display font-semibold text-destructive">Obránce</p>
                  {enemyCity && <p className="text-sm">🏰 {enemyCity.name} ({enemyCity.owner_player})</p>}
                  {enemyStack && <p className="text-sm">⚔ {enemyStack.name} ({enemyStack.manpower} mužů)</p>}
                  <p className="text-[10px] text-muted-foreground">Hex ({battleTarget.q}, {battleTarget.r})</p>
                </div>

                {/* Battle speech */}
                <div className="space-y-2">
                  <label className="text-xs font-display font-semibold">Bitevní proslov (volitelný)</label>
                  <textarea
                    className="w-full p-2 rounded-lg border border-border bg-card text-xs min-h-[60px] resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="Promluvte ke svým vojákům..."
                    value={battleSpeech}
                    onChange={(e) => setBattleSpeech(e.target.value)}
                  />
                  {battleSpeech.trim() && !speechResult && (
                    <Button size="sm" variant="outline" className="text-xs font-display w-full"
                      disabled={evaluatingSpeech}
                      onClick={handleEvaluateSpeech}>
                      {evaluatingSpeech ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                      Vyhodnotit proslov
                    </Button>
                  )}
                  {speechResult && (
                    <div className="p-2 rounded border border-primary/30 bg-primary/5 text-xs space-y-1">
                      <p className="font-display font-semibold">
                        Morálka: <span className={speechResult.morale_modifier >= 0 ? "text-accent" : "text-destructive"}>
                          {speechResult.morale_modifier >= 0 ? "+" : ""}{speechResult.morale_modifier}
                        </span>
                      </p>
                      <p className="text-muted-foreground italic">{speechResult.ai_feedback}</p>
                    </div>
                  )}
                </div>

                <Button className="w-full font-display gap-2" disabled={submittingBattle}
                  onClick={handleSubmitBattle}>
                  {submittingBattle ? <Loader2 className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" />}
                  Zaútočit!
                </Button>
              </div>
            );
          })()}
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
