import { useState, useCallback, useEffect, useRef, useMemo, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Loader2, Hexagon, Map as MapIcon, Eye, Plus, Minus, RefreshCw,
  Home, Pencil, Swords, Castle, Compass, ChevronUp, ChevronDown,
  Layers, Info, X,
} from "lucide-react";
import { toast } from "sonner";
import { useHexMap, AXIAL_NEIGHBORS, type HexData } from "@/hooks/useHexMap";
import CityMarkerBadge from "@/components/CityMarkerBadge";
import FoundSettlementDialog from "@/components/FoundSettlementDialog";

/* ───── Config ───── */
const HEX_SIZE = 38;
const SQRT3 = Math.sqrt(3);
const PAN_SPEED = 60; // pixels per keypress

const BIOME_COLORS: Record<string, string> = {
  sea: "#1a3a5c", plains: "#5a7a3a", forest: "#264d2e", hills: "#7a6a42",
  mountains: "#5a5a62", desert: "#b09850", swamp: "#2e4a3c", tundra: "#5a7888",
};
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
const BIOME_ICONS: Record<string, string> = {
  sea: "🌊", plains: "🌾", forest: "🌲", hills: "⛰",
  mountains: "🏔", desert: "🏜", swamp: "🌿", tundra: "❄",
};
const IMPASSABLE_BIOMES = new Set(["sea", "mountains"]);
const CITY_ALLOWED_BIOMES = new Set(["plains", "hills", "forest", "swamp"]);
const FOG_COLOR = "#111318";

/* Province palette — 10 distinct, muted colors for overlay */
const PROVINCE_COLORS = [
  "hsla(210, 60%, 50%, 0.12)", // blue
  "hsla(30, 70%, 50%, 0.12)",  // orange
  "hsla(120, 50%, 40%, 0.12)", // green
  "hsla(0, 60%, 50%, 0.12)",   // red
  "hsla(270, 50%, 50%, 0.12)", // purple
  "hsla(60, 60%, 45%, 0.12)",  // yellow
  "hsla(180, 50%, 40%, 0.12)", // teal
  "hsla(330, 50%, 50%, 0.12)", // pink
  "hsla(150, 50%, 40%, 0.12)", // emerald
  "hsla(45, 70%, 50%, 0.12)",  // gold
];
const PROVINCE_BORDER_COLORS = [
  "hsla(210, 70%, 60%, 0.7)",
  "hsla(30, 80%, 60%, 0.7)",
  "hsla(120, 60%, 50%, 0.7)",
  "hsla(0, 70%, 60%, 0.7)",
  "hsla(270, 60%, 60%, 0.7)",
  "hsla(60, 70%, 55%, 0.7)",
  "hsla(180, 60%, 50%, 0.7)",
  "hsla(330, 60%, 60%, 0.7)",
  "hsla(150, 60%, 50%, 0.7)",
  "hsla(45, 80%, 60%, 0.7)",
];
const PROVINCE_LEGEND_COLORS = [
  "hsl(210, 60%, 50%)", "hsl(30, 70%, 50%)", "hsl(120, 50%, 40%)",
  "hsl(0, 60%, 50%)", "hsl(270, 50%, 50%)", "hsl(60, 60%, 45%)",
  "hsl(180, 50%, 40%)", "hsl(330, 50%, 50%)", "hsl(150, 50%, 40%)", "hsl(45, 70%, 50%)",
];

/* ───── Hex edge math for province borders ───── */
// Returns the two vertices of a hex edge for a given direction index (0-5)
// Direction indices correspond to AXIAL_NEIGHBORS order
const HEX_EDGE_DIRS: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1],
];
function hexEdgeVertices(cx: number, cy: number, edgeIdx: number): [number, number, number, number] {
  // Each edge connects vertex[i] to vertex[(i+1)%6]
  // Map neighbor direction to the edge between two vertices
  const EDGE_TO_VERTICES: Record<number, [number, number]> = {
    0: [0, 5], // +q direction → right edge (vertices 0,5)
    1: [3, 2], // -q direction → left edge (vertices 3,2)
    2: [5, 4], // +r direction → bottom-right (vertices 5,4)
    3: [2, 1], // -r direction → top-left (vertices 2,1)
    4: [1, 0], // +q,-r direction → top-right (vertices 1,0)
    5: [4, 3], // -q,+r direction → bottom-left (vertices 4,3)
  };
  const [v1, v2] = EDGE_TO_VERTICES[edgeIdx];
  const a1 = (Math.PI / 180) * (60 * v1 - 30);
  const a2 = (Math.PI / 180) * (60 * v2 - 30);
  return [
    cx + HEX_SIZE * Math.cos(a1), cy + HEX_SIZE * Math.sin(a1),
    cx + HEX_SIZE * Math.cos(a2), cy + HEX_SIZE * Math.sin(a2),
  ];
}

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

/* ───── Types ───── */
interface CityOnHex {
  id: string; name: string; owner_player: string; q: number; r: number;
  settlement_level: string; isCapital?: boolean; imageUrl?: string | null;
  mapIconUrl?: string | null; population: number;
}
interface StackOnHex {
  id: string; name: string; player_name: string; q: number; r: number;
  manpower: number; formation_type: string; morale?: number;
  imageUrl?: string | null; sigilUrl?: string | null;
}
interface Props {
  sessionId: string; playerName: string; myRole: string;
  currentTurn?: number;
  onCityClick?: (cityId: string) => void;
}

/* ───── HexTile (memoized) ───── */
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

  return (
    <g onClick={isAttackTarget ? () => onAttackClick?.(q, r) : isMoveTarget ? () => onMoveClick?.(q, r) : onClick} className="cursor-pointer">
      {isFrontier && <title>Prozkoumat ({q}, {r})</title>}
      <polygon
        points={pts}
        fill={showBiome ? `url(#biome-grad-${hex.biome_family})` : showFrontierBiome ? `url(#biome-grad-${hex.biome_family})` : FOG_COLOR}
        stroke={isCurrent ? "hsl(45, 90%, 55%)" : isFrontier ? "hsl(var(--primary) / 0.4)" : "hsl(var(--border))"}
        strokeWidth={isCurrent ? 2.5 : isFrontier ? 1.2 : 0.8}
        opacity={showBiome ? 1 : showFrontierBiome ? 0.35 : isFrontier ? 0.25 : 0.3}
        strokeDasharray={isFrontier ? "3,3" : undefined}
        className={isFrontier ? "hover:opacity-60 transition-opacity" : ""}
      />
      {showFrontierBiome && (
        <polygon points={pts} fill={FOG_COLOR} opacity={0.45} style={{ pointerEvents: "none" }} />
      )}
      {showBiome && (
        <polygon points={pts} fill={`url(#pat-${hex.biome_family})`} style={{ pointerEvents: "none" }} />
      )}
      {loading && (
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
          fill="hsl(var(--muted-foreground))" fontSize="10">⏳</text>
      )}
      {showBiome && !loading && (
        <>
          {cities.length > 0 ? (
            <>
              {cities.slice(0, 3).map((c, i) => (
                <CityMarkerBadge key={c.id} cityId={c.id} cityName={c.name}
                  settlementLevel={c.settlement_level} ownerPlayer={c.owner_player}
                  isCapital={c.isCapital} imageUrl={c.imageUrl} mapIconUrl={c.mapIconUrl}
                  population={c.population} size="md"
                  cx={cx + (i > 0 ? (i === 1 ? -8 : 8) : 0)}
                  cy={cy + (i > 0 ? 6 : 0)}
                  onClick={() => onCityClick?.(c.id)}
                />
              ))}
              {cities.length > 3 && (
                <text x={cx + 14} y={cy + 18} textAnchor="middle" dominantBaseline="middle"
                  fill="white" fontSize="7" fontWeight="700" style={{ pointerEvents: "none" }}>+{cities.length - 3}</text>
              )}
            </>
          ) : (
            <>
              {/* Biome icon */}
              <text x={cx} y={cy - 8} textAnchor="middle" dominantBaseline="middle"
                fill="white" fontSize="12" style={{ pointerEvents: "none" }}>
                {BIOME_ICONS[hex.biome_family] || ""}
              </text>
              <text x={cx} y={cy + 6} textAnchor="middle" dominantBaseline="middle"
                fill="white" fontSize="7" fontWeight="600" opacity={0.7} style={{ pointerEvents: "none" }}>
                {BIOME_LABELS[hex.biome_family] || hex.biome_family}
              </text>
            </>
          )}
          {hex.coastal && !hex.has_river && cities.length === 0 && (
            <text x={cx} y={cy + 16} textAnchor="middle" dominantBaseline="middle"
              fill="#60a5fa" fontSize="7" style={{ pointerEvents: "none" }}>🌊</text>
          )}
          {/* River indicator */}
          {hex.has_river && (
            <>
              <line
                x1={cx - HEX_SIZE * 0.5} y1={cy - 2}
                x2={cx + HEX_SIZE * 0.5} y2={cy + 2}
                stroke="#4a9eff" strokeWidth={hex.has_bridge ? 1.5 : 2.5}
                opacity={0.8} strokeLinecap="round"
                strokeDasharray={hex.has_bridge ? "3,2" : undefined}
                style={{ pointerEvents: "none" }}
              />
              {hex.has_bridge && (
                <text x={cx} y={cy + (cities.length > 0 ? -14 : 16)} textAnchor="middle" dominantBaseline="middle"
                  fill="#f5c542" fontSize="8" style={{ pointerEvents: "none" }}>🌉</text>
              )}
              {!hex.has_bridge && cities.length === 0 && (
                <text x={cx} y={cy + 16} textAnchor="middle" dominantBaseline="middle"
                  fill="#4a9eff" fontSize="7" fontWeight="600" style={{ pointerEvents: "none" }}>〰️</text>
              )}
            </>
          )}
          {devMode && (
            <text x={cx} y={cy + 22} textAnchor="middle" dominantBaseline="middle"
              fill="hsl(var(--muted-foreground))" fontSize="6" opacity={0.5} style={{ pointerEvents: "none" }}>
              ({q},{r})
            </text>
          )}
          {/* Army stacks */}
          {stacks.length > 0 && (
            <>
              {stacks.slice(0, 3).map((s, i) => {
                const isOwn = s.player_name === myPlayerName;
                const isSelected = s.id === selectedStackId;
                const yOff = cities.length > 0 ? 22 : 0;
                const xOff = cities.length > 0 ? (i === 0 ? -12 : i === 1 ? 12 : 0) : (i > 0 ? (i === 1 ? -10 : 10) : 0);
                const stackCx = cx + xOff;
                const stackCy = cy + yOff + (i > 0 && cities.length > 0 ? 4 : 0);
                const rad = 11;
                const clipId = `stack-clip-${s.id}`;
                const hasImage = !!s.imageUrl;
                const borderColor = isSelected ? "hsl(45, 90%, 55%)" : isOwn ? "hsl(45, 80%, 55%)" : "hsl(0, 60%, 55%)";
                return (
                  <g key={s.id} className="cursor-pointer" onClick={(e) => { e.stopPropagation(); if (isOwn && onStackClick) onStackClick(s); }}>
                    <defs><clipPath id={clipId}><circle cx={stackCx} cy={stackCy} r={rad} /></clipPath></defs>
                    <circle cx={stackCx} cy={stackCy} r={rad + 1} fill="black" opacity={0.3} />
                    <circle cx={stackCx} cy={stackCy} r={rad} fill="hsl(var(--card))" stroke={borderColor} strokeWidth={isSelected ? 2.2 : 1.4} />
                    {hasImage ? (
                      <>
                        <image href={s.imageUrl!} x={stackCx - rad} y={stackCy - rad} width={rad * 2} height={rad * 2}
                          clipPath={`url(#${clipId})`} preserveAspectRatio="xMidYMid slice" style={{ pointerEvents: "none" }} />
                        <circle cx={stackCx} cy={stackCy} r={rad} fill="none" stroke={borderColor} strokeWidth={isSelected ? 2.2 : 1.4} />
                      </>
                    ) : (
                      <text x={stackCx} y={stackCy + 1} textAnchor="middle" dominantBaseline="middle"
                        fill={isOwn ? "hsl(45, 80%, 60%)" : "hsl(0, 60%, 65%)"} fontSize="10" style={{ pointerEvents: "none" }}>⚔</text>
                    )}
                    {s.sigilUrl && (
                      <image href={s.sigilUrl} x={stackCx + rad * 0.3} y={stackCy - rad - 2} width={10} height={10}
                        preserveAspectRatio="xMidYMid meet" style={{ pointerEvents: "none" }} />
                    )}
                    <rect x={stackCx - 10} y={stackCy + rad - 2} width="20" height="9" rx="4"
                      fill="hsl(0, 0%, 8%)" fillOpacity="0.85" stroke={borderColor} strokeWidth="0.6" />
                    <text x={stackCx} y={stackCy + rad + 3.5} textAnchor="middle" dominantBaseline="middle"
                      fill={isOwn ? "hsl(45, 80%, 70%)" : "hsl(0, 60%, 70%)"} fontSize="5.5" fontWeight="700" style={{ pointerEvents: "none" }}>{s.manpower}</text>
                    <text x={stackCx} y={stackCy + rad + 11} textAnchor="middle" dominantBaseline="hanging"
                      fill="white" fontSize="5" fontWeight="600" style={{ pointerEvents: "none", textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}>
                      {s.name.length > 10 ? s.name.slice(0, 9) + "…" : s.name}
                    </text>
                  </g>
                );
              })}
              {stacks.length > 3 && (
                <text x={cx + 16} y={cy + (cities.length > 0 ? 22 : 16)} textAnchor="middle" dominantBaseline="middle"
                  fill="hsl(45, 80%, 60%)" fontSize="6" fontWeight="700" style={{ pointerEvents: "none" }}>+{stacks.length - 3}</text>
              )}
            </>
          )}
          {/* Move target overlay */}
          {isMoveTarget && (
            <>
              <polygon points={pts} fill="hsl(120, 60%, 40%)" opacity={0.2} style={{ pointerEvents: "none" }} />
              <polygon points={pts} fill="none" stroke="hsl(120, 70%, 50%)" strokeWidth={2} strokeDasharray="4,3" opacity={0.7} style={{ pointerEvents: "none" }} />
              <text x={cx} y={cy + (cities.length > 0 ? -16 : 16)} textAnchor="middle" dominantBaseline="middle"
                fill="hsl(120, 70%, 60%)" fontSize="7" fontWeight="700" style={{ pointerEvents: "none" }}>↗ Přesun</text>
            </>
          )}
          {/* Attack target overlay */}
          {isAttackTarget && (
            <>
              <polygon points={pts} fill="hsl(0, 70%, 40%)" opacity={0.25} style={{ pointerEvents: "none" }} />
              <polygon points={pts} fill="none" stroke="hsl(0, 80%, 55%)" strokeWidth={2} strokeDasharray="4,3" opacity={0.8} style={{ pointerEvents: "none" }} />
              <text x={cx} y={cy + (cities.length > 0 ? -16 : 16)} textAnchor="middle" dominantBaseline="middle"
                fill="hsl(0, 80%, 65%)" fontSize="7" fontWeight="700" style={{ pointerEvents: "none" }}>⚔ Útok</text>
            </>
          )}
        </>
      )}
      {isFrontier && !loading && (
        <>
          <text x={cx} y={cy - 4} textAnchor="middle" dominantBaseline="middle"
            fill="hsl(var(--primary))" fontSize="12" opacity={0.7} style={{ pointerEvents: "none" }}>?</text>
          <text x={cx} y={cy + 8} textAnchor="middle" dominantBaseline="middle"
            fill="hsl(var(--primary))" fontSize="5.5" opacity={0.5} style={{ pointerEvents: "none" }}>Prozkoumat</text>
        </>
      )}
    </g>
  );
});
HexTile.displayName = "HexTile";

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════ */
const WorldHexMap = ({ sessionId, playerName, myRole, currentTurn, onCityClick }: Props) => {
  const isAdmin = myRole === "admin" || myRole === "moderator";
  const [devMode, setDevMode] = useState(isAdmin);
  const [selectedHex, setSelectedHex] = useState<HexData | null>(null);
  const [editBiome, setEditBiome] = useState<string | null>(null);
  const [savingBiome, setSavingBiome] = useState(false);
  const [discoveredIds, setDiscoveredIds] = useState<Set<string>>(new Set());
  const [discoveredCoords, setDiscoveredCoords] = useState<Set<string>>(new Set());
  const [exploring, setExploring] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
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
  const [battleResult, setBattleResult] = useState<any>(null);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [showFoundDialog, setShowFoundDialog] = useState(false);
  const [showProvinceLayer, setShowProvinceLayer] = useState(true);
  const [expandingProvince, setExpandingProvince] = useState(false);

  // Province data
  const [provinceHexMap, setProvinceHexMap] = useState<Map<string, { provinceId: string; colorIndex: number }>>(new Map());
  const [provinceLegend, setProvinceLegend] = useState<{ id: string; name: string; colorIndex: number; ownerPlayer: string }[]>([]);

  // Pan state
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number; moved: boolean } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { hexes, getHex, isLoading, fetchHex, loadHexesByIds, loadAllGenerated } = useHexMap(sessionId);

  /* ── Load cities ── */
  const fetchCities = useCallback(async () => {
    const [{ data }, { data: images }, { data: mapIcons }] = await Promise.all([
      supabase.from("cities")
        .select("id, name, owner_player, province_q, province_r, settlement_level, population_total")
        .eq("session_id", sessionId).not("province_q", "is", null).not("province_r", "is", null),
      supabase.from("encyclopedia_images").select("entity_id, image_url")
        .eq("session_id", sessionId).eq("entity_type", "city").eq("is_primary", true),
      supabase.from("encyclopedia_images").select("entity_id, image_url")
        .eq("session_id", sessionId).eq("entity_type", "city").eq("kind", "map_icon"),
    ]);
    if (data) {
      const imgMap = new Map<string, string>();
      for (const img of images || []) imgMap.set(img.entity_id, img.image_url);
      const iconMap = new Map<string, string>();
      for (const icon of mapIcons || []) iconMap.set(icon.entity_id, icon.image_url);
      const capitalIds = new Set<string>();
      const byPlayer = new Map<string, typeof data>();
      for (const c of data) { const list = byPlayer.get(c.owner_player) || []; list.push(c); byPlayer.set(c.owner_player, list); }
      for (const [, pCities] of byPlayer) { const cap = pCities.find(c => c.settlement_level === "CITY") || pCities[0]; if (cap) capitalIds.add(cap.id); }
      const mapped: CityOnHex[] = data.map(c => ({
        id: c.id, name: c.name, owner_player: c.owner_player,
        q: c.province_q!, r: c.province_r!, settlement_level: c.settlement_level,
        isCapital: capitalIds.has(c.id), imageUrl: imgMap.get(c.id) || null,
        mapIconUrl: iconMap.get(c.id) || null, population: c.population_total || 1000,
      }));
      setAllCities(mapped);
      setPlayerCities(mapped.filter(c => c.owner_player === playerName));
    }
  }, [sessionId, playerName]);

  /* ── Fetch stacks ── */
  const fetchStacks = useCallback(async () => {
    console.log("Fetching stacks for session:", sessionId);
    const { data: rawStacks, error } = await supabase.from("military_stacks")
      .select("id, name, player_name, hex_q, hex_r, formation_type, is_deployed, is_active, morale, image_url, image_confirmed, sigil_url, sigil_confirmed")
      .eq("session_id", sessionId).eq("is_deployed", true).eq("is_active", true);
    
    if (error) console.error("Error fetching stacks:", error);
    if (!rawStacks || rawStacks.length === 0) { console.log("No stacks found"); setAllStacks([]); return; }
    console.log("Found stacks:", rawStacks.length);
    const stackIds = rawStacks.map(s => s.id);
    const { data: comps } = await supabase.from("military_stack_composition").select("stack_id, manpower").in("stack_id", stackIds);
    const mpMap = new Map<string, number>();
    for (const c of comps || []) mpMap.set(c.stack_id, (mpMap.get(c.stack_id) || 0) + c.manpower);
    setAllStacks(rawStacks.map(s => ({
      id: s.id, name: s.name, player_name: s.player_name,
      q: s.hex_q ?? 0, r: s.hex_r ?? 0, manpower: mpMap.get(s.id) || 0,
      formation_type: s.formation_type, morale: s.morale ?? 70,
      imageUrl: s.image_confirmed && s.image_url ? s.image_url : null,
      sigilUrl: s.sigil_confirmed && s.sigil_url ? s.sigil_url : null,
    })));
  }, [sessionId]);

  /* ── Fetch province data ── */
  const fetchProvinces = useCallback(async () => {
    const [{ data: provs }, { data: provHexes }] = await Promise.all([
      supabase.from("provinces").select("id, name, color_index, owner_player, is_neutral")
        .eq("session_id", sessionId),
      supabase.from("province_hexes").select("q, r, province_id, owner_player")
        .eq("session_id", sessionId),
    ]);
    if (provHexes) {
      const provColorMap = new Map<string, number>();
      for (const p of provs || []) provColorMap.set(p.id, p.color_index ?? 0);
      
      // Build a color index for owner_player as fallback
      const ownerColorMap = new Map<string, number>();
      let ownerIdx = 0;
      for (const p of provs || []) {
        if (p.owner_player && !ownerColorMap.has(p.owner_player)) {
          ownerColorMap.set(p.owner_player, ownerIdx++);
        }
      }
      
      const hexMap = new Map<string, { provinceId: string; colorIndex: number }>();
      for (const ph of provHexes) {
        const provId = ph.province_id;
        if (provId) {
          hexMap.set(hKey(ph.q, ph.r), {
            provinceId: provId,
            colorIndex: provColorMap.get(provId) ?? (ph.owner_player ? (ownerColorMap.get(ph.owner_player) ?? 0) : 0),
          });
        } else if (ph.owner_player) {
          // Hex owned but not in a province yet — show with faction color
          hexMap.set(hKey(ph.q, ph.r), {
            provinceId: "",
            colorIndex: ownerColorMap.get(ph.owner_player) ?? 0,
          });
        }
      }
      setProvinceHexMap(hexMap);
    }
    if (provs) {
      setProvinceLegend(provs.map(p => ({
        id: p.id, name: p.name, colorIndex: p.color_index ?? 0,
        ownerPlayer: p.owner_player,
      })));
    }
  }, [sessionId]);

  /* ── Lookups ── */
  const citiesByCoord = useMemo(() => {
    const visible = allCities.filter(c => devMode || c.owner_player === playerName || isAdmin || discoveredCoords.has(hKey(c.q, c.r)));
    const m = new Map<string, CityOnHex[]>();
    for (const c of visible) { const key = hKey(c.q, c.r); const list = m.get(key) || []; list.push(c); m.set(key, list); }
    return m;
  }, [allCities, playerName, isAdmin, discoveredCoords, devMode]);

  const stacksByCoord = useMemo(() => {
    const visible = allStacks.filter(s => devMode || s.player_name === playerName || isAdmin || discoveredCoords.has(hKey(s.q, s.r)));
    const m = new Map<string, StackOnHex[]>();
    for (const s of visible) { const key = hKey(s.q, s.r); const list = m.get(key) || []; list.push(s); m.set(key, list); }
    return m;
  }, [allStacks, playerName, isAdmin, discoveredCoords, devMode]);

  /* ── Load discoveries ── */
  const fetchDiscoveries = useCallback(async () => {
    const { data } = await supabase.from("discoveries").select("entity_id")
      .eq("session_id", sessionId).eq("player_name", playerName).eq("entity_type", "province_hex");
    const ids = (data || []).map(d => d.entity_id);
    setDiscoveredIds(new Set(ids));
    await loadHexesByIds(ids);
  }, [sessionId, playerName, loadHexesByIds]);

  useEffect(() => {
    const coords = new Set<string>();
    for (const id of discoveredIds) {
      const hex = Object.values(hexes).find(h => h.id === id);
      if (hex) coords.add(hKey(hex.q, hex.r));
    }
    setDiscoveredCoords(coords);
  }, [discoveredIds, hexes]);

  /* ── Frontier ── */
  const frontierCoords = useMemo(() => {
    // In devMode, no frontier — everything is revealed
    if (devMode) return new Set<string>();
    const frontier = new Set<string>();
    for (const coordStr of discoveredCoords) {
      const [q, r] = coordStr.split(",").map(Number);
      for (const n of AXIAL_NEIGHBORS) {
        const nk = hKey(q + n.dq, r + n.dr);
        if (!discoveredCoords.has(nk)) frontier.add(nk);
      }
    }
    return frontier;
  }, [discoveredCoords, devMode]);

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
    Promise.all(toFetch.slice(0, 20).map(c => fetchHex(c.q, c.r)));
  }, [frontierCoords, getHex, fetchHex]);

  /* ── Render coords ── */
  const renderCoords = useMemo(() => {
    const all = new Map<string, { q: number; r: number; isFrontier: boolean }>();
    if (devMode) {
      // DevMode: show ALL loaded hexes as fully revealed
      for (const key of Object.keys(hexes)) { const [q, r] = key.split(",").map(Number); all.set(key, { q, r, isFrontier: false }); }
    } else {
      for (const coordStr of discoveredCoords) { const [q, r] = coordStr.split(",").map(Number); all.set(coordStr, { q, r, isFrontier: false }); }
      for (const fk of frontierCoords) { const [q, r] = fk.split(",").map(Number); all.set(fk, { q, r, isFrontier: true }); }
    }
    return Array.from(all.values());
  }, [hexes, discoveredCoords, frontierCoords, devMode]);

  /* ── Camera center ── */
  const cameraCenter = useMemo(() => {
    // In devMode, center on the midpoint of ALL hexes for a full overview
    if (devMode && Object.keys(hexes).length > 0) {
      let sx = 0, sy = 0, n = 0;
      for (const key of Object.keys(hexes)) {
        const [q, r] = key.split(",").map(Number);
        const p = hexToPixel(q, r);
        sx += p.x; sy += p.y; n++;
      }
      return { x: sx / n, y: sy / n };
    }
    if (currentPos) return hexToPixel(currentPos.q, currentPos.r);
    if (playerCities.length > 0) return hexToPixel(playerCities[0].q, playerCities[0].r);
    if (discoveredCoords.size === 0) return { x: 0, y: 0 };
    let sx = 0, sy = 0, n = 0;
    for (const coordStr of discoveredCoords) { const [q, r] = coordStr.split(",").map(Number); const p = hexToPixel(q, r); sx += p.x; sy += p.y; n++; }
    return { x: sx / n, y: sy / n };
  }, [currentPos, playerCities, discoveredCoords, devMode, hexes]);

  /* ── Bootstrap ── */
  const bootstrapCityDiscoveries = useCallback(async (cities: CityOnHex[]) => {
    if (cities.length === 0 || bootstrapping) return;
    setBootstrapping(true);
    try {
      for (const city of cities) {
        await supabase.functions.invoke("explore-hex", { body: { session_id: sessionId, player_name: playerName, q: city.q, r: city.r } });
      }
      await fetchDiscoveries();
      setCurrentPos({ q: cities[0].q, r: cities[0].r });
    } catch (e: any) { console.error("Bootstrap failed", e); }
    finally { setBootstrapping(false); }
  }, [sessionId, playerName, fetchDiscoveries, bootstrapping]);

  /* ── AUTO-LOAD on mount ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.all([fetchCities(), fetchStacks(), fetchProvinces()]);
      if (cancelled) return;
      if (isAdmin) await loadAllGenerated();
      await fetchDiscoveries();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Load all hexes when devMode is toggled on
  const devModeLoadedRef = useRef(false);
  useEffect(() => {
    if (devMode && !devModeLoadedRef.current) {
      devModeLoadedRef.current = true;
      loadAllGenerated();
    }
  }, [devMode, loadAllGenerated]);

  useEffect(() => {
    if (bootstrapping) return;
    if (discoveredIds.size === 0 && playerCities.length > 0) {
      bootstrapCityDiscoveries(playerCities);
    } else if (discoveredIds.size > 0 && currentPos === null && playerCities.length > 0) {
      setCurrentPos({ q: playerCities[0].q, r: playerCities[0].r });
    }
  }, [discoveredIds.size, playerCities, currentPos, bootstrapping, bootstrapCityDiscoveries]);

  /* ── Explore frontier ── */
  const handleExploreFrontier = useCallback(async (q: number, r: number) => {
    const key = hKey(q, r);
    setExploring(key);
    try {
      const { data, error } = await supabase.functions.invoke("explore-hex", { body: { session_id: sessionId, player_name: playerName, q, r } });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      await fetchDiscoveries();
      await fetchCities();
      toast.success(`Provincie (${q}, ${r}) objevena!`);
    } catch (e: any) { toast.error("Průzkum selhal: " + (e.message || "neznámá chyba")); }
    finally { setExploring(null); }
  }, [sessionId, playerName, fetchDiscoveries, fetchCities]);

  const handleMoveToHex = useCallback((q: number, r: number) => {
    setCurrentPos({ q, r });
  }, []);

  /* ── Keyboard controls (WASD + arrows) ── */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      let dx = 0, dy = 0;
      switch (e.key) {
        case "w": case "W": case "ArrowUp": dy = PAN_SPEED; break;
        case "s": case "S": case "ArrowDown": dy = -PAN_SPEED; break;
        case "a": case "A": case "ArrowLeft": dx = PAN_SPEED; break;
        case "d": case "D": case "ArrowRight": dx = -PAN_SPEED; break;
        case "+": case "=": setZoom(z => Math.min(3, z + 0.15)); return;
        case "-": case "_": setZoom(z => Math.max(0.3, z - 0.15)); return;
        case "Escape":
          setSelectedStack(null);
          setSelectedHex(null);
          setBattleTarget(null);
          return;
        default: return;
      }
      e.preventDefault();
      setPan(p => ({ x: p.x + dx, y: p.y + dy }));
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  /* ── Pan handlers (mouse drag) ── */
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
  const goHome = () => {
    if (playerCities.length > 0) { setCurrentPos({ q: playerCities[0].q, r: playerCities[0].r }); setPan({ x: 0, y: 0 }); }
  };

  /* ── Recompute biomes ── */
  const handleRecomputeBiomes = useCallback(async () => {
    const allIds = Object.values(hexes).map(h => h.id).filter(Boolean);
    if (allIds.length === 0) { toast.error("Žádné hexy k přepočtu"); return; }
    setRecomputing(true);
    try {
      const { data, error } = await supabase.functions.invoke("recompute-biomes", { body: { session_id: sessionId, hex_ids: allIds } });
      if (error) throw error;
      if (isAdmin) await loadAllGenerated();
      await fetchDiscoveries();
      toast.success(`Přepočteno ${data?.updated?.length || 0} hexů`);
    } catch (e: any) { toast.error("Chyba: " + (e.message || "neznámá")); }
    finally { setRecomputing(false); }
  }, [hexes, sessionId, isAdmin, loadAllGenerated, fetchDiscoveries]);

  /* ── Save biome ── */
  const handleSaveBiome = useCallback(async () => {
    if (!selectedHex || !editBiome || editBiome === selectedHex.biome_family) return;
    setSavingBiome(true);
    try {
      const { error } = await supabase.from("province_hexes").update({ biome_family: editBiome }).eq("id", selectedHex.id);
      if (error) throw error;
      if (isAdmin) await loadAllGenerated(); else await fetchDiscoveries();
      toast.success(`Biom změněn na ${BIOME_LABELS[editBiome] || editBiome}`);
      setSelectedHex(null); setEditBiome(null);
    } catch (e: any) { toast.error("Chyba: " + (e.message || "neznámá")); }
    finally { setSavingBiome(false); }
  }, [selectedHex, editBiome, isAdmin, loadAllGenerated, fetchDiscoveries]);

  /* ── Move/attack targets ── */
  const moveTargetCoords = useMemo(() => {
    if (!selectedStack) return new Set<string>();
    const targets = new Set<string>();
    for (const n of AXIAL_NEIGHBORS) {
      const nk = hKey(selectedStack.q + n.dq, selectedStack.r + n.dr);
      if (discoveredCoords.has(nk) || (isAdmin && devMode)) {
        const hex = getHex(selectedStack.q + n.dq, selectedStack.r + n.dr);
        if (hex && !IMPASSABLE_BIOMES.has(hex.biome_family) && !(hex.has_river && !hex.has_bridge)) {
          targets.add(nk);
        }
      }
    }
    return targets;
  }, [selectedStack, discoveredCoords, isAdmin, devMode, getHex]);

  const attackTargetCoords = useMemo(() => {
    if (!selectedStack) return new Set<string>();
    const targets = new Set<string>();
    for (const n of AXIAL_NEIGHBORS) {
      const nq = selectedStack.q + n.dq; const nr = selectedStack.r + n.dr;
      const nk = hKey(nq, nr);
      const hexCities = citiesByCoord.get(nk) || []; const hexStacks = stacksByCoord.get(nk) || [];
      if (hexCities.some(c => c.owner_player !== playerName) || hexStacks.some(s => s.player_name !== playerName)) targets.add(nk);
    }
    return targets;
  }, [selectedStack, citiesByCoord, stacksByCoord, playerName]);

  const handleStackClick = useCallback((stack: StackOnHex) => {
    if (dragRef.current?.moved) return;
    if (stack.player_name !== playerName) return;
    setSelectedStack(prev => prev?.id === stack.id ? null : stack);
  }, [playerName]);

  const handleMoveStackToHex = useCallback(async (targetQ: number, targetR: number) => {
    if (!selectedStack || movingStack) return;
    const { data: stackData } = await supabase.from("military_stacks").select("moved_this_turn, name").eq("id", selectedStack.id).single();
    if (stackData?.moved_this_turn) { toast.error("Tato jednotka se již tento tah přesunula!"); return; }
    setMovingStack(true);
    try {
      // 1. Update position
      const { error } = await supabase.from("military_stacks").update({ hex_q: targetQ, hex_r: targetR, moved_this_turn: true }).eq("id", selectedStack.id);
      if (error) throw error;
      // 2. Log via event sourcing
      const { dispatchCommand } = await import("@/lib/commands");
      await dispatchCommand({
        sessionId,
        actor: { name: playerName },
        commandType: "MOVE_STACK",
        commandPayload: {
          stackId: selectedStack.id,
          stackName: selectedStack.name || stackData?.name || "Armáda",
        fromQ: selectedStack.q,
        fromR: selectedStack.r,
          toQ: targetQ,
          toR: targetR,
          chronicleText: `${playerName} přesunul **${selectedStack.name || "armádu"}** na pozici (${targetQ}, ${targetR}).`,
        },
      });
      toast.success(`${selectedStack.name} přesunuta na (${targetQ}, ${targetR})`);
      setSelectedStack(null); await fetchStacks();
    } catch (e: any) { toast.error("Přesun selhal: " + (e.message || "neznámá chyba")); }
    finally { setMovingStack(false); }
  }, [selectedStack, movingStack, fetchStacks, sessionId, playerName]);

  const handleAttackClick = useCallback((q: number, r: number) => {
    if (dragRef.current?.moved) return;
    if (!selectedStack) return;
    setBattleTarget({ q, r }); setBattleSpeech(""); setSpeechResult(null);
  }, [selectedStack]);

  const handleEvaluateSpeech = useCallback(async () => {
    if (!battleSpeech.trim() || !selectedStack || !battleTarget) return;
    setEvaluatingSpeech(true);
    try {
      const hexCities = citiesByCoord.get(hKey(battleTarget.q, battleTarget.r)) || [];
      const hexStacks = stacksByCoord.get(hKey(battleTarget.q, battleTarget.r)) || [];
      const enemyCity = hexCities.find(c => c.owner_player !== playerName);
      const enemyStack = hexStacks.find(s => s.player_name !== playerName);
      const { data, error } = await supabase.functions.invoke("battle-speech", {
        body: { speech_text: battleSpeech, attacker_name: selectedStack.name, defender_name: enemyCity?.name || enemyStack?.name || "nepřítel", biome: "plains", attacker_morale: selectedStack.morale ?? 70 },
      });
      if (error) throw error;
      setSpeechResult({ morale_modifier: data?.morale_modifier || 0, ai_feedback: data?.ai_feedback || "" });
    } catch (e: any) { toast.error("Vyhodnocení selhalo"); }
    finally { setEvaluatingSpeech(false); }
  }, [battleSpeech, selectedStack, battleTarget, citiesByCoord, stacksByCoord, playerName]);

  const handleSubmitBattle = useCallback(async () => {
    if (!selectedStack || !battleTarget) return;
    setSubmittingBattle(true);
    try {
      const hexCities = citiesByCoord.get(hKey(battleTarget.q, battleTarget.r)) || [];
      const hexStacks = stacksByCoord.get(hKey(battleTarget.q, battleTarget.r)) || [];
      const enemyCity = hexCities.find(c => c.owner_player !== playerName);
      const enemyStack = hexStacks.find(s => s.player_name !== playerName);
      const { data: session } = await supabase.from("game_sessions").select("current_turn").eq("id", sessionId).single();
      const turn = session?.current_turn || 1;
      const seed = Math.floor(Math.random() * 1000000);

      // Resolve battle immediately
      const { data, error } = await supabase.functions.invoke("resolve-battle", {
        body: {
          session_id: sessionId, player_name: playerName, current_turn: turn,
          attacker_stack_id: selectedStack.id,
          defender_city_id: enemyCity?.id || null,
          defender_stack_id: enemyStack?.id || null,
          speech_text: battleSpeech || null,
          speech_morale_modifier: speechResult?.morale_modifier || 0,
          seed,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Show result immediately
      setBattleResult(data);
      setBattleTarget(null); setSelectedStack(null);
      await Promise.all([fetchStacks(), fetchCities()]);
    } catch (e: any) { toast.error("Chyba: " + (e.message || "neznámá")); }
    setSubmittingBattle(false);
  }, [selectedStack, battleTarget, citiesByCoord, stacksByCoord, playerName, sessionId, battleSpeech, speechResult, fetchStacks, fetchCities]);

  const handleTileClick = useCallback((q: number, r: number, isFrontier: boolean) => {
    if (dragRef.current?.moved) return;
    if (isFrontier) { handleExploreFrontier(q, r); return; }
    if (selectedStack) { setSelectedStack(null); return; }
    // Open hex detail in sheet
    const hex = getHex(q, r);
    if (hex) { setSelectedHex(hex); setEditBiome(null); }
  }, [handleExploreFrontier, selectedStack, getHex]);

  /* ── Check if hex is suitable for founding ── */
  const canFoundOnSelectedHex = useMemo(() => {
    if (!selectedHex) return false;
    if (selectedHex.biome_family === "sea" || selectedHex.biome_family === "mountains") return false;
    const hexKey = hKey(selectedHex.q, selectedHex.r);
    const existingCities = citiesByCoord.get(hexKey) || [];
    return existingCities.length === 0;
  }, [selectedHex, citiesByCoord]);

  /* ── Check if hex can be annexed to player's province ── */
  const expandableProvinceInfo = useMemo(() => {
    if (!selectedHex) return null;
    // Check if hex is already in a province
    const provData = provinceHexMap.get(hKey(selectedHex.q, selectedHex.r));
    if (provData) return null; // already assigned
    // Check if any adjacent hex belongs to the player's province
    for (const { dq, dr } of AXIAL_NEIGHBORS) {
      const nk = hKey(selectedHex.q + dq, selectedHex.r + dr);
      const neighborProv = provinceHexMap.get(nk);
      if (neighborProv) {
        const legend = provinceLegend.find(p => p.id === neighborProv.provinceId);
        if (legend && legend.ownerPlayer === playerName) {
          return { provinceId: neighborProv.provinceId, provinceName: legend.name };
        }
      }
    }
    return null;
  }, [selectedHex, provinceHexMap, provinceLegend, playerName]);

  /* ── Handle province expansion ── */
  const handleExpandProvince = useCallback(async () => {
    if (!selectedHex || !expandableProvinceInfo || expandingProvince) return;
    setExpandingProvince(true);
    try {
      const { data, error } = await supabase.functions.invoke("expand-province", {
        body: {
          session_id: sessionId,
          player_name: playerName,
          province_id: expandableProvinceInfo.provinceId,
          target_q: selectedHex.q,
          target_r: selectedHex.r,
        },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      toast.success(`Hex (${selectedHex.q}, ${selectedHex.r}) přidán do ${expandableProvinceInfo.provinceName}`);
      await Promise.all([fetchProvinces(), fetchDiscoveries()]);
      setSelectedHex(null);
    } catch (e: any) { toast.error("Expanze selhala: " + (e.message || "neznámá chyba")); }
    finally { setExpandingProvince(false); }
  }, [selectedHex, expandableProvinceInfo, expandingProvince, sessionId, playerName, fetchProvinces, fetchDiscoveries]);

  /* ── SVG layout ── */
  const svgW = 2000;
  const svgH = 1400;
  const offsetX = svgW / 2 - cameraCenter.x;
  const offsetY = svgH / 2 - cameraCenter.y;

  return (
    <div ref={containerRef} className="relative w-full h-full bg-[#0a0c10] overflow-hidden select-none touch-none"
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp} onWheel={onWheel} tabIndex={0}
    >
      {/* ── SVG Map ── */}
      <svg width="100%" height="100%" viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          {Object.entries(BIOME_GRADIENTS).map(([biome, [c1, c2]]) => (
            <radialGradient key={`grad-${biome}`} id={`biome-grad-${biome}`} cx="50%" cy="40%" r="70%">
              <stop offset="0%" stopColor={c1} /><stop offset="100%" stopColor={c2} />
            </radialGradient>
          ))}
          <pattern id="pat-sea" patternUnits="userSpaceOnUse" width="20" height="12" patternTransform="rotate(-15)">
            <path d="M0 6 Q5 3 10 6 Q15 9 20 6" fill="none" stroke="#2a5a8a" strokeWidth="0.8" opacity="0.4" />
          </pattern>
          <pattern id="pat-forest" patternUnits="userSpaceOnUse" width="14" height="14">
            <circle cx="4" cy="4" r="2.5" fill="#1a4a22" opacity="0.5" /><circle cx="11" cy="10" r="3" fill="#1e5528" opacity="0.45" />
          </pattern>
          <pattern id="pat-hills" patternUnits="userSpaceOnUse" width="24" height="16" patternTransform="rotate(5)">
            <path d="M0 12 Q6 6 12 12 Q18 6 24 12" fill="none" stroke="#5a4a2a" strokeWidth="0.7" opacity="0.35" />
          </pattern>
          <pattern id="pat-mountains" patternUnits="userSpaceOnUse" width="20" height="18">
            <path d="M2 18 L10 4 L18 18" fill="none" stroke="#8a8a92" strokeWidth="0.9" opacity="0.35" />
            <path d="M8 6 L10 4 L12 6" fill="#aab0b8" opacity="0.3" />
          </pattern>
          <pattern id="pat-desert" patternUnits="userSpaceOnUse" width="28" height="14" patternTransform="rotate(-8)">
            <path d="M0 10 Q7 4 14 10 Q21 4 28 10" fill="none" stroke="#d0b868" strokeWidth="0.8" opacity="0.35" />
          </pattern>
          <pattern id="pat-swamp" patternUnits="userSpaceOnUse" width="16" height="16">
            <line x1="4" y1="14" x2="4" y2="6" stroke="#4a6a50" strokeWidth="0.6" opacity="0.4" />
            <line x1="12" y1="14" x2="12" y2="8" stroke="#3a5a44" strokeWidth="0.6" opacity="0.35" />
          </pattern>
          <pattern id="pat-tundra" patternUnits="userSpaceOnUse" width="18" height="18">
            <circle cx="4" cy="4" r="0.8" fill="#a0c0d0" opacity="0.35" /><circle cx="14" cy="8" r="0.6" fill="#b0d0e0" opacity="0.3" />
          </pattern>
          <pattern id="pat-plains" patternUnits="userSpaceOnUse" width="16" height="12" patternTransform="rotate(10)">
            <line x1="3" y1="10" x2="4" y2="5" stroke="#7a9a4a" strokeWidth="0.5" opacity="0.3" />
            <line x1="13" y1="10" x2="12" y2="4" stroke="#7a9a4a" strokeWidth="0.5" opacity="0.3" />
          </pattern>
        </defs>
        <g transform={`translate(${pan.x / zoom}, ${pan.y / zoom}) scale(${zoom})`}>
          {/* Province overlay layer — fill + border edges */}
          {showProvinceLayer && renderCoords.map(c => {
            const provData = provinceHexMap.get(hKey(c.q, c.r));
            if (!provData || c.isFrontier) return null;
            const pos = hexToPixel(c.q, c.r);
            const cx = pos.x + offsetX;
            const cy = pos.y + offsetY;
            const pts = hexPoints(cx, cy);
            const ci = provData.colorIndex % PROVINCE_COLORS.length;
            // Find edges where neighbor belongs to a different owner/province
            const borderEdges: { x1: number; y1: number; x2: number; y2: number }[] = [];
            for (let di = 0; di < HEX_EDGE_DIRS.length; di++) {
              const [dq, dr] = HEX_EDGE_DIRS[di];
              const nk = hKey(c.q + dq, c.r + dr);
              const neighborProv = provinceHexMap.get(nk);
              // Draw border if neighbor is different owner OR is unowned
              if (!neighborProv || neighborProv.colorIndex !== provData.colorIndex) {
                const [x1, y1, x2, y2] = hexEdgeVertices(cx, cy, di);
                borderEdges.push({ x1, y1, x2, y2 });
              }
            }
            return (
              <g key={`prov-${hKey(c.q, c.r)}`} style={{ pointerEvents: "none" }}>
                <polygon points={pts} fill={PROVINCE_COLORS[ci]} />
                {borderEdges.map((e, i) => (
                  <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
                    stroke={PROVINCE_BORDER_COLORS[ci]} strokeWidth={2.5} strokeLinecap="round" />
                ))}
              </g>
            );
          })}
          {renderCoords.map(c => {
            const hex = getHex(c.q, c.r);
            const isCurrent = currentPos !== null && c.q === currentPos.q && c.r === currentPos.r && !c.isFrontier;
            return (
              <HexTile key={hKey(c.q, c.r)} q={c.q} r={c.r} hex={hex}
                isFrontier={c.isFrontier} isCurrent={isCurrent} devMode={devMode}
                loading={isLoading(c.q, c.r) || exploring === hKey(c.q, c.r)}
                onClick={() => handleTileClick(c.q, c.r, c.isFrontier)}
                offsetX={offsetX} offsetY={offsetY}
                cities={citiesByCoord.get(hKey(c.q, c.r)) || []}
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

      {/* Bootstrapping overlay */}
      {bootstrapping && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm z-30">
          <div className="flex items-center gap-3 px-6 py-3 rounded-xl bg-card border border-border shadow-2xl">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm font-display">Objevuji provincie…</span>
          </div>
        </div>
      )}

      {renderCoords.length === 0 && !bootstrapping && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* ── Overlay Controls ── */}
      {/* Top-left: position + stats */}
      <div className="absolute top-3 left-3 z-20 flex flex-col gap-1.5">
        {currentPos && (
          <Badge variant="secondary" className="text-[10px] gap-1 bg-card/80 backdrop-blur-sm border-border">
            📍 ({currentPos.q}, {currentPos.r})
            {(citiesByCoord.get(hKey(currentPos.q, currentPos.r)) || []).length > 0 && (
              <span className="ml-1 font-semibold">{citiesByCoord.get(hKey(currentPos.q, currentPos.r))![0].name}</span>
            )}
          </Badge>
        )}
        <div className="flex gap-1">
          <Badge variant="outline" className="text-[9px] bg-card/70 backdrop-blur-sm">{discoveredCoords.size} provincií</Badge>
          <Badge variant="outline" className="text-[9px] bg-card/70 backdrop-blur-sm">{frontierCoords.size} hranice</Badge>
        </div>
      </div>

      {/* Top-right: admin controls */}
      {isAdmin && (
        <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer bg-card/70 backdrop-blur-sm px-2 py-1 rounded-md border border-border">
            <Switch checked={devMode} onCheckedChange={async (v) => { setDevMode(v); if (v) await loadAllGenerated(); }} className="scale-75" />
            <Eye className="h-3 w-3" /> DEV
          </label>
          {devMode && (
            <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 bg-card/70 backdrop-blur-sm"
              onClick={handleRecomputeBiomes} disabled={recomputing}>
              {recomputing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Přepočítat
            </Button>
          )}
        </div>
      )}

      {/* Right: zoom + home controls */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1.5">
        <Button size="icon" variant="secondary" className="h-8 w-8 bg-card/80 backdrop-blur-sm border-border" onClick={zoomIn}>
          <Plus className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="secondary" className="h-8 w-8 bg-card/80 backdrop-blur-sm border-border" onClick={zoomOut}>
          <Minus className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="secondary" className="h-8 w-8 bg-card/80 backdrop-blur-sm border-border" onClick={goHome} title="Hlavní město">
          <Home className="h-4 w-4" />
        </Button>
      </div>

      {/* Bottom-left: legend toggle */}
      <div className="absolute bottom-3 left-3 z-20">
        <Button size="sm" variant="secondary" className="h-7 text-[10px] gap-1.5 bg-card/80 backdrop-blur-sm border-border"
          onClick={() => setShowLegend(!showLegend)}>
          <Layers className="h-3 w-3" />
          Legenda {showLegend ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
        </Button>
        {showLegend && (
          <div className="mt-1.5 p-3 rounded-lg bg-card/90 backdrop-blur-md border border-border shadow-xl max-w-[320px]">
            {/* Province legend */}
            {provinceLegend.length > 0 && (
              <div className="mb-2 pb-2 border-b border-border">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] font-display font-semibold text-foreground">Provincie</p>
                  <label className="flex items-center gap-1 text-[9px] text-muted-foreground cursor-pointer">
                    <input type="checkbox" checked={showProvinceLayer} onChange={e => setShowProvinceLayer(e.target.checked)} className="w-3 h-3" />
                    Zobrazit
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[9px]">
                  {provinceLegend.map(p => (
                    <div key={p.id} className="flex items-center gap-1.5 truncate">
                      <span className="w-2.5 h-2.5 rounded-sm inline-block flex-shrink-0 border border-border"
                        style={{ backgroundColor: PROVINCE_LEGEND_COLORS[p.colorIndex % PROVINCE_LEGEND_COLORS.length] }} />
                      <span className="text-muted-foreground truncate">{p.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
              {Object.entries(BIOME_LABELS).map(([key, label]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded inline-block border border-border" style={{ backgroundColor: BIOME_COLORS[key] }} />
                  <span className="text-muted-foreground">{BIOME_ICONS[key]} {label}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3 mt-2 pt-2 border-t border-border">
              <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-full border-2 border-[hsl(45,90%,55%)] inline-block" /> Pozice
              </span>
              <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded border border-dashed border-muted-foreground/40 bg-[#111318] opacity-40 inline-block" /> Neprozkoumaný
              </span>
              <span className="text-[9px] text-muted-foreground">🏰 Město</span>
              <span className="text-[9px] text-muted-foreground">👑 Hlavní město</span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom-center: keyboard hint */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
        <div className="px-3 py-1 rounded-full bg-card/60 backdrop-blur-sm border border-border text-[9px] text-muted-foreground">
          WASD / šipky = posun · kolečko = zoom · klik = průzkum / detail · ESC = zrušit
        </div>
      </div>

      {/* Bottom-right: selected unit panel */}
      {selectedStack && (
        <div className="absolute bottom-3 right-3 z-20 p-3 rounded-lg border border-primary/40 bg-card/90 backdrop-blur-md max-w-[220px] shadow-xl">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <Swords className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-display font-bold text-foreground truncate">{selectedStack.name}</span>
            </div>
            <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setSelectedStack(null)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span>👥 {selectedStack.manpower}</span>
            <span>📍 ({selectedStack.q},{selectedStack.r})</span>
          </div>
          <p className="text-[9px] mt-1.5 text-muted-foreground">
            <span className="text-green-400">Zelený</span> = přesun
            {attackTargetCoords.size > 0 && <span className="text-red-400"> · Červený = útok</span>}
          </p>
          {movingStack && (
            <div className="flex items-center gap-1 mt-1.5">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
              <span className="text-[9px] text-muted-foreground">Přesouvám…</span>
            </div>
          )}
        </div>
      )}

      {/* ── Hex Detail Sheet (slide-out panel) ── */}
      <Sheet open={!!selectedHex} onOpenChange={(open) => { if (!open) { setSelectedHex(null); setEditBiome(null); } }}>
        <SheetContent side="right" className="w-[340px] sm:w-[380px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-display flex items-center gap-2 text-base">
              <Hexagon className="h-5 w-5 text-primary" />
              Provincie ({selectedHex?.q}, {selectedHex?.r})
            </SheetTitle>
          </SheetHeader>
          {selectedHex && (
            <div className="space-y-4 mt-4">
              {/* Cities on this hex */}
              {(citiesByCoord.get(hKey(selectedHex.q, selectedHex.r)) || []).length > 0 && (
                <div className="p-3 rounded-lg border border-primary/30 bg-primary/5">
                  <p className="text-xs font-display font-semibold mb-2 flex items-center gap-1.5">
                    <Castle className="h-3.5 w-3.5 text-primary" /> Města
                  </p>
                  {(citiesByCoord.get(hKey(selectedHex.q, selectedHex.r)) || []).map(c => (
                    <button key={c.id} onClick={() => { onCityClick?.(c.id); setSelectedHex(null); }}
                      className="w-full text-left p-2 rounded-md hover:bg-primary/10 transition-colors flex items-center gap-2">
                      <span className="text-sm font-display font-semibold">{c.isCapital ? "👑" : "🏰"} {c.name}</span>
                      <Badge variant="outline" className="text-[8px] ml-auto">{c.settlement_level}</Badge>
                    </button>
                  ))}
                </div>
              )}

              {/* Hex info */}
              <div className="grid grid-cols-2 gap-2">
                <InfoRow label="Biom" value={`${BIOME_ICONS[selectedHex.biome_family] || ""} ${BIOME_LABELS[selectedHex.biome_family] || selectedHex.biome_family}`} />
                <InfoRow label="Výška" value={`${selectedHex.mean_height}/100`} />
                <InfoRow label="Vlhkost" value={`Band ${selectedHex.moisture_band}`} />
                <InfoRow label="Teplota" value={`Band ${selectedHex.temp_band}`} />
                <InfoRow label="Pobřeží" value={selectedHex.coastal ? "✅ Ano" : "❌ Ne"} />
                <InfoRow label="Seed" value={selectedHex.seed.slice(-8)} />
              </div>

              {/* Province info */}
              {(() => {
                const provData = provinceHexMap.get(hKey(selectedHex.q, selectedHex.r));
                const legend = provData ? provinceLegend.find(p => p.id === provData.provinceId) : null;
                return legend ? (
                  <div className="p-3 rounded-lg border border-border bg-muted/30">
                    <p className="text-xs font-display font-semibold mb-1 flex items-center gap-1.5">
                      <MapIcon className="h-3 w-3" /> Provincie
                    </p>
                    <p className="text-sm font-display">{legend.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Vlastník: {legend.ownerPlayer}</p>
                  </div>
                ) : (
                  <div className="p-2 rounded-lg border border-dashed border-muted-foreground/30">
                    <p className="text-[10px] text-muted-foreground text-center">Volné území — nepatří žádné provincii</p>
                  </div>
                );
              })()}

              {/* Macro region */}
              {selectedHex.macro_region && (
                <div className="p-3 rounded-lg border border-border bg-muted/30">
                  <p className="text-xs font-display font-semibold mb-1">Makroregion</p>
                  <p className="text-sm font-display">{selectedHex.macro_region.name}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Elev: {selectedHex.macro_region.elevation_band} · Clim: {selectedHex.macro_region.climate_band} · Moist: {selectedHex.macro_region.moisture_band}
                  </p>
                </div>
              )}

              {/* Stacks on hex */}
              {(stacksByCoord.get(hKey(selectedHex.q, selectedHex.r)) || []).length > 0 && (
                <div className="p-3 rounded-lg border border-border bg-card">
                  <p className="text-xs font-display font-semibold mb-2 flex items-center gap-1.5">
                    <Swords className="h-3.5 w-3.5" /> Armády
                  </p>
                  {(stacksByCoord.get(hKey(selectedHex.q, selectedHex.r)) || []).map(s => (
                    <div key={s.id} className="flex items-center gap-2 text-xs p-1.5">
                      <span className={s.player_name === playerName ? "text-primary" : "text-destructive"}>⚔</span>
                      <span className="font-display font-semibold">{s.name}</span>
                      <span className="text-muted-foreground ml-auto">{s.manpower} mužů</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Biome editor (admin) */}
              {isAdmin && (
                <div className="p-3 rounded-lg border border-primary/30 bg-primary/5 space-y-2">
                  <p className="text-xs font-display font-semibold flex items-center gap-1.5">
                    <Pencil className="h-3 w-3 text-primary" /> Změnit biom
                  </p>
                  <div className="flex gap-2">
                    <Select value={editBiome ?? selectedHex.biome_family} onValueChange={setEditBiome}>
                      <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(BIOME_LABELS).map(([key, label]) => (
                          <SelectItem key={key} value={key} className="text-xs">{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" className="h-8 text-xs gap-1" disabled={savingBiome || !editBiome || editBiome === selectedHex.biome_family} onClick={handleSaveBiome}>
                      {savingBiome ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Uložit
                    </Button>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="space-y-2">
                <Button variant="outline" size="sm" className="w-full font-display text-xs gap-2"
                  onClick={() => { setCurrentPos({ q: selectedHex.q, r: selectedHex.r }); setPan({ x: 0, y: 0 }); setSelectedHex(null); }}>
                  <Compass className="h-3.5 w-3.5" /> Centrovat mapu sem
                </Button>

                {/* Found settlement button */}
                {canFoundOnSelectedHex && (
                  <Button variant="default" size="sm" className="w-full font-display text-xs gap-2"
                    onClick={() => { setShowFoundDialog(true); }}>
                    <Castle className="h-3.5 w-3.5" /> Založit osadu zde
                  </Button>
                )}

                {/* Expand province button */}
                {expandableProvinceInfo && (
                  <Button variant="secondary" size="sm" className="w-full font-display text-xs gap-2"
                    onClick={handleExpandProvince} disabled={expandingProvince}>
                    {expandingProvince ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapIcon className="h-3.5 w-3.5" />}
                    Připojit k {expandableProvinceInfo.provinceName}
                    <span className="text-muted-foreground ml-auto text-[9px]">20💰 5🪵</span>
                  </Button>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Battle dialog */}
      <Dialog open={!!battleTarget} onOpenChange={(open) => { if (!open) { setBattleTarget(null); setSpeechResult(null); setBattleSpeech(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Swords className="h-5 w-5 text-destructive" /> Zahájit bitvu
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
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-display font-semibold">Bitevní proslov (volitelný)</label>
                  <textarea className="w-full p-2 rounded-lg border border-border bg-card text-xs min-h-[60px] resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="Promluvte ke svým vojákům..." value={battleSpeech} onChange={(e) => setBattleSpeech(e.target.value)} />
                  {battleSpeech.trim() && !speechResult && (
                    <Button size="sm" variant="outline" className="text-xs font-display w-full" disabled={evaluatingSpeech} onClick={handleEvaluateSpeech}>
                      {evaluatingSpeech ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null} Vyhodnotit proslov
                    </Button>
                  )}
                  {speechResult && (
                    <div className="p-2 rounded border border-primary/30 bg-primary/5 text-xs space-y-1">
                      <p className="font-display font-semibold">Morálka: <span className={speechResult.morale_modifier >= 0 ? "text-accent" : "text-destructive"}>{speechResult.morale_modifier >= 0 ? "+" : ""}{speechResult.morale_modifier}</span></p>
                      <p className="text-muted-foreground italic">{speechResult.ai_feedback}</p>
                    </div>
                  )}
                </div>
                <Button className="w-full font-display gap-2" disabled={submittingBattle} onClick={handleSubmitBattle}>
                  {submittingBattle ? <Loader2 className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" />} Zaútočit!
                </Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Battle result dialog */}
      <Dialog open={!!battleResult} onOpenChange={(open) => { if (!open) setBattleResult(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Swords className="h-5 w-5 text-primary" /> Výsledek bitvy
            </DialogTitle>
          </DialogHeader>
          {battleResult && (
            <div className="space-y-3">
              <div className={`p-4 rounded-lg border text-center space-y-1 ${
                battleResult.result?.includes("victory") ? "border-accent/40 bg-accent/10" : "border-destructive/40 bg-destructive/10"
              }`}>
                <p className={`text-lg font-display font-bold ${
                  battleResult.result?.includes("victory") ? "text-accent" : "text-destructive"
                }`}>
                  {battleResult.result_label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {battleResult.attacker_name} vs {battleResult.defender_name}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded border border-border bg-card">
                  <p className="text-muted-foreground">Síla útočníka</p>
                  <p className="font-display font-semibold">{battleResult.attacker_strength}</p>
                </div>
                <div className="p-2 rounded border border-border bg-card">
                  <p className="text-muted-foreground">Síla obránce</p>
                  <p className="font-display font-semibold">{battleResult.defender_strength}</p>
                </div>
                <div className="p-2 rounded border border-border bg-card">
                  <p className="text-muted-foreground">Ztráty útočníka</p>
                  <p className="font-display font-semibold text-destructive">{battleResult.casualties_attacker}</p>
                </div>
                <div className="p-2 rounded border border-border bg-card">
                  <p className="text-muted-foreground">Ztráty obránce</p>
                  <p className="font-display font-semibold text-destructive">{battleResult.casualties_defender}</p>
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground text-center">
                Luck: {((battleResult.luck_roll || 0) * 100).toFixed(0)}%
              </div>
              {battleResult.needs_decision && (
                <div className="p-2 rounded border border-illuminated/30 bg-illuminated/5 text-xs text-center">
                  <p className="font-display font-semibold text-illuminated">⚖️ Rozhodnutí po bitvě čeká!</p>
                  <p className="text-muted-foreground">Přejděte na záložku Armáda.</p>
                </div>
              )}
              <Button className="w-full font-display" onClick={() => setBattleResult(null)}>
                Zavřít
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Found settlement dialog */}
      {selectedHex && (
        <FoundSettlementDialog
          open={showFoundDialog}
          onClose={() => setShowFoundDialog(false)}
          sessionId={sessionId}
          currentPlayerName={playerName}
          currentTurn={currentTurn || 1}
          myRole={myRole}
          targetQ={selectedHex.q}
          targetR={selectedHex.r}
          onCreated={(cityId) => {
            setShowFoundDialog(false);
            setSelectedHex(null);
            Promise.all([fetchCities(), fetchProvinces()]);
            onCityClick?.(cityId);
          }}
        />
      )}
    </div>
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
