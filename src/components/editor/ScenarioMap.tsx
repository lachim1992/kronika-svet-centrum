import { useEffect, useMemo, useState } from "react";
import { Castle, Flag, Gem, Minus, Pickaxe, Plus, Route, Scan } from "lucide-react";
import { Button } from "@/components/ui/button";
import { projectCell, squareDiamondPoints } from "@/lib/mapTopology";
import {
  MICRO_BIOME_LABEL, SCENARIO_BIOMES, armySoldiers, knownResourcesAt, pointKey, prospectProbability,
  type Scenario, type ScenarioBiome, type ScenarioPoint, type ScenarioResource, type ScenarioTile,
} from "@/lib/scenarioSandbox";
import type { Deposit } from "../../../supabase/functions/_shared/geology";

export type EditorSelection =
  | { kind: "tile"; id: string }
  | { kind: "city" | "army" | "site" | "road"; id: string }
  | null;

const BIOME_TOKEN: Record<ScenarioBiome, string> = {
  plains: "map-plains", forest: "map-forest", hills: "map-hills", mountain: "map-mountain",
  water: "map-water", desert: "map-desert", swamp: "map-swamp",
};
const MICRO_TOKEN: Record<string, string> = {
  grassland: "map-plains", fertile_flat: "map-plains", clearing: "map-plains", fertile_silt: "map-plains",
  sheltered_hollow: "map-plains", creek_bank: "map-plains", raised_bank: "map-plains",
  dense_forest: "map-forest", ridge_woods: "map-forest",
  hillock: "map-hills", terrace: "map-hills", saddle: "map-hills",
  cliff_edge: "map-mountain", steep_slope: "map-mountain", permafrost_rise: "map-tundra",
  boggy_dip: "map-swamp", reed_marsh: "map-swamp", dune: "map-desert",
  open_water: "map-water", river_channel: "map-water", shore: "map-desert", harbour_flat: "map-desert",
};
const biomeFill = (biome: ScenarioBiome) => `var(--${BIOME_TOKEN[biome]})`;
const microFill = (micro: string) => `var(--${MICRO_TOKEN[micro] ?? "map-plains"})`;

interface MacroProps {
  scenario: Scenario;
  deposits: Map<string, Deposit[]>;
  selectedTile: ScenarioPoint | null;
  roadDraft: ScenarioPoint | null;
  selection: EditorSelection;
  overlayKind: ScenarioResource["kind"] | null;
  onCell: (x: number, y: number, dragging: boolean) => void;
  onStrokeStart: () => void;
  onSelect: (selection: EditorSelection) => void;
}

export function ScenarioMap({ scenario, deposits, selectedTile, roadDraft, selection, overlayKind, onCell, onStrokeStart, onSelect }: MacroProps) {
  const [zoom, setZoom] = useState(1.3);
  const [painting, setPainting] = useState(false);
  const size = 46;
  const offset = { x: scenario.height * size + 70, y: 70 };
  const viewWidth = (scenario.width + scenario.height) * size + 140;
  const viewHeight = (scenario.width + scenario.height) * size * 0.5 + 150;
  const centers = useMemo(() => new Map(scenario.tiles.map(tile => {
    const projected = projectCell("square4", { a: tile.x, b: tile.y }, size);
    return [pointKey(tile), { x: projected.x + offset.x, y: projected.y + offset.y }];
  })), [scenario.tiles, offset.x, offset.y]);

  useEffect(() => {
    const stop = () => setPainting(false);
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, []);

  const selectEntity = (event: React.PointerEvent, next: EditorSelection) => {
    event.stopPropagation();
    setPainting(false);
    onSelect(next);
  };
  const probability = (tile: ScenarioTile) => overlayKind
    ? Math.max(...tile.micro.map((_, index) => prospectProbability(scenario, tile, index, overlayKind, deposits)))
    : 0;

  return (
    <div className="relative h-[calc(100vh-150px)] min-h-[520px] max-h-[900px] overflow-hidden rounded-lg border border-primary/20 bg-map">
      <div className="absolute right-3 top-3 z-20 flex gap-1 rounded-md border border-primary/20 bg-background/85 p-1 backdrop-blur">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.max(0.7, z - 0.15))} aria-label="Oddálit mapu"><Minus className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(1)} aria-label="Přizpůsobit mapu"><Scan className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.min(2.2, z + 0.15))} aria-label="Přiblížit mapu"><Plus className="h-4 w-4" /></Button>
      </div>
      <div className="h-full overflow-auto p-3">
        <svg
          viewBox={`0 0 ${viewWidth} ${viewHeight}`}
          className="mx-auto block h-auto max-w-none select-none transition-[width] duration-200"
          style={{ width: `${Math.round(zoom * 100)}%`, minWidth: `${Math.round(zoom * 620)}px` }}
          role="img"
          aria-label="Izometrická mapa scénáře"
        >
          <defs>
            <filter id="editor-shadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="var(--map-label-edge)" floodOpacity=".5" />
            </filter>
          </defs>
          {scenario.tiles.map(tile => {
            const center = centers.get(pointKey(tile))!;
            const selected = selectedTile?.x === tile.x && selectedTile.y === tile.y;
            const draft = roadDraft?.x === tile.x && roadDraft.y === tile.y;
            const p = probability(tile);
            return (
              <g key={pointKey(tile)}>
                <polygon
                  points={squareDiamondPoints(center, size - 0.6)}
                  fill={biomeFill(tile.biome)}
                  stroke={selected || draft ? "var(--map-focus)" : "var(--map-marker-edge)"}
                  strokeWidth={selected || draft ? 2.4 : 0.8}
                  className="cursor-pointer transition-[filter] hover:brightness-110"
                  role="button"
                  tabIndex={0}
                  aria-label={`${SCENARIO_BIOMES[tile.biome].label} ${tile.x},${tile.y}`}
                  onPointerDown={event => { event.preventDefault(); setPainting(true); onStrokeStart(); onCell(tile.x, tile.y, false); }}
                  onPointerEnter={() => { if (painting) onCell(tile.x, tile.y, true); }}
                  onKeyDown={event => { if (event.key === "Enter" || event.key === " ") onCell(tile.x, tile.y, false); }}
                >
                  <title>{`${SCENARIO_BIOMES[tile.biome].label} · ${tile.x},${tile.y}`}</title>
                </polygon>
                {overlayKind && p > 0 && (
                  <polygon points={squareDiamondPoints(center, size - 3)} fill="hsl(var(--primary))" fillOpacity={Math.min(0.78, 0.08 + p * 0.7)} pointerEvents="none">
                    <title>Nejvyšší pravděpodobnost v makropoli: {Math.round(p * 100)} %</title>
                  </polygon>
                )}
                {overlayKind && p >= 0.05 && (
                  <text x={center.x} y={center.y + 17} textAnchor="middle" fontSize="8" fontWeight="700" fill="var(--map-label)" stroke="var(--map-label-edge)" strokeWidth="2" paintOrder="stroke" pointerEvents="none">
                    {Math.round(p * 100)} %
                  </text>
                )}
              </g>
            );
          })}

          {scenario.roads.map(road => {
            const a = centers.get(pointKey(road.from))!, b = centers.get(pointKey(road.to))!;
            const selected = selection?.kind === "road" && selection.id === road.id;
            return (
              <g key={road.id} onPointerDown={event => selectEntity(event, { kind: "road", id: road.id })} className="cursor-pointer">
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--map-road-edge)" strokeWidth={selected ? 9 : 7} strokeLinecap="round" />
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={selected ? "var(--map-focus)" : "var(--map-road-paved)"} strokeWidth={selected ? 5 : 3.5} strokeLinecap="round" />
                <title>Cesta · {road.owner}</title>
              </g>
            );
          })}

          {scenario.cities.map(city => {
            const c = centers.get(`${city.x},${city.y}`)!;
            const selected = selection?.kind === "city" && selection.id === city.id;
            return (
              <g key={city.id} transform={`translate(${c.x} ${c.y - 8})`} filter="url(#editor-shadow)" onPointerDown={event => selectEntity(event, { kind: "city", id: city.id })} className="cursor-pointer">
                {selected && <ellipse cx="0" cy="10" rx="23" ry="9" fill="none" stroke="var(--map-focus)" strokeWidth="2" />}
                <path d="M-15 8V-9h6v5h6v-9h6v9h6v-5h6V8Z" fill="var(--map-city-wall-light)" stroke="var(--map-city-wall-dark)" strokeWidth="1.5" />
                <path d="M-4 8V0h8v8" fill="var(--map-city-base)" />
                <line x1="3" y1="-13" x2="3" y2="-27" stroke="var(--map-road-edge)" strokeWidth="1.5" />
                <path d="M4-26 17-22 4-18Z" fill={city.owner === "Hráč" ? "var(--map-city-own)" : "var(--map-city-rival)"} />
                <text x="0" y="25" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--map-label)" stroke="var(--map-label-edge)" strokeWidth="3" paintOrder="stroke">{city.name}</text>
                <title>{city.name} · {city.owner} · {city.population.toLocaleString("cs-CZ")} obyvatel</title>
              </g>
            );
          })}

          {scenario.armies.map(army => {
            const c = centers.get(`${army.x},${army.y}`)!;
            const selected = selection?.kind === "army" && selection.id === army.id;
            return (
              <g key={army.id} transform={`translate(${c.x + 12} ${c.y - 7})`} onPointerDown={event => selectEntity(event, { kind: "army", id: army.id })}
                role="button" tabIndex={0} aria-label={`Armáda ${army.name}`}
                onKeyDown={event => { if (event.key === "Enter" || event.key === " ") onSelect({ kind: "army", id: army.id }); }}
                className="cursor-pointer">
                {selected && <ellipse cx="0" cy="8" rx="17" ry="7" fill="none" stroke="var(--map-focus)" strokeWidth="2" />}
                <path d="M-10 7V-5h6V3h6v-8h6V7Z" fill="var(--map-army-metal)" stroke="var(--map-army-metal-dark)" strokeWidth="1.3" />
                <line x1="8" y1="5" x2="8" y2="-22" stroke="var(--map-army-wood)" strokeWidth="1.6" />
                <path d="M9-21 23-17 9-12Z" fill={army.owner === "Hráč" ? "var(--map-city-own)" : "var(--map-city-rival)"} />
                <text x="0" y="20" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--map-label)" stroke="var(--map-label-edge)" strokeWidth="3" paintOrder="stroke">{armySoldiers(army).toLocaleString("cs-CZ")}</text>
                <title>{army.name} · {army.owner} · {armySoldiers(army)} mužů</title>
              </g>
            );
          })}

          {scenario.sites.map(site => {
            const count = scenario.sites.filter(s => s.x === site.x && s.y === site.y && s.id <= site.id).length;
            if (count > 1) return null;
            const c = centers.get(`${site.x},${site.y}`)!;
            const number = scenario.sites.filter(s => s.x === site.x && s.y === site.y).length;
            return (
              <g key={site.id} transform={`translate(${c.x - 25} ${c.y + 3})`} onPointerDown={event => selectEntity(event, { kind: "site", id: site.id })} className="cursor-pointer">
                <path d="M0-9 10 7H-10Z" fill="var(--map-parcel-industry)" stroke="var(--map-focus)" strokeWidth="1.2" />
                <text x="0" y="5" textAnchor="middle" fontSize="9" fontWeight="800" fill="var(--map-label)">{number}</text>
                <title>{number} těžebních staveb</title>
              </g>
            );
          })}

          {scenario.resources.length > 0 && scenario.tiles.map(tile => {
            const count = scenario.resources.filter(r => r.x === tile.x && r.y === tile.y).length;
            if (!count) return null;
            const c = centers.get(pointKey(tile))!;
            return <g key={`resources-${pointKey(tile)}`} transform={`translate(${c.x + 25} ${c.y + 8})`} pointerEvents="none">
              <circle r="8" fill="var(--map-parcel-market)" stroke="var(--map-marker-edge)" />
              <text y="3" textAnchor="middle" fontSize="8" fontWeight="800" fill="var(--map-marker)">{count}</text>
              <title>{count} potvrzených surovin</title>
            </g>;
          })}
        </svg>
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-3 rounded-md border border-primary/15 bg-background/85 px-3 py-2 text-[11px] text-muted-foreground backdrop-blur">
        <span className="flex items-center gap-1"><Castle className="h-3.5 w-3.5 text-primary" /> Města {scenario.cities.length}</span>
        <span className="flex items-center gap-1"><Flag className="h-3.5 w-3.5 text-primary" /> Armády {scenario.armies.length}</span>
        <span className="flex items-center gap-1"><Route className="h-3.5 w-3.5 text-primary" /> Cesty {scenario.roads.length}</span>
        <span className="flex items-center gap-1"><Gem className="h-3.5 w-3.5 text-primary" /> Suroviny {scenario.resources.length}</span>
        <span className="flex items-center gap-1"><Pickaxe className="h-3.5 w-3.5 text-primary" /> Stavby {scenario.sites.length}</span>
      </div>
    </div>
  );
}

interface MicroProps {
  scenario: Scenario;
  tile: ScenarioTile;
  deposits: Map<string, Deposit[]>;
  overlayKind: ScenarioResource["kind"] | null;
  onMicroCell: (mx: number, my: number) => void;
}

export function ScenarioMicroGrid({ scenario, tile, deposits, overlayKind, onMicroCell }: MicroProps) {
  return (
    <div className="grid grid-cols-6 gap-1.5 rounded-lg border border-primary/20 bg-map p-2 sm:gap-2 sm:p-4" aria-label={`Mikropolíčka ${tile.x},${tile.y}`}>
      {tile.micro.map((micro, index) => {
        const mx = index % 6, my = Math.floor(index / 6);
        const resources = scenario.resources.filter(r => r.x === tile.x && r.y === tile.y && r.mx === mx && r.my === my);
        const sites = scenario.sites.filter(s => s.x === tile.x && s.y === tile.y && s.mx === mx && s.my === my);
        const known = knownResourcesAt(scenario, tile, index);
        const probability = overlayKind ? prospectProbability(scenario, tile, index, overlayKind, deposits) : null;
        return (
          <button
            key={index}
            type="button"
            data-testid={`micro-cell-${mx}-${my}`}
            onClick={() => onMicroCell(mx, my)}
            className="group relative aspect-square min-w-0 overflow-hidden rounded-md border border-background/40 text-left shadow-inner transition-transform hover:z-10 hover:scale-[1.04] hover:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
            style={{ background: microFill(micro) }}
            title={`${MICRO_BIOME_LABEL[micro] ?? micro} · ${known.length ? `Suroviny: ${known.join(", ")}` : "Bez potvrzené suroviny"}`}
          >
            <span className="absolute inset-x-1 top-1 truncate rounded bg-background/70 px-1 py-0.5 text-[8px] font-medium leading-tight text-foreground sm:text-[9px]">
              {MICRO_BIOME_LABEL[micro] ?? micro}
            </span>
            {probability !== null && probability > 0 && (
              <span className="absolute inset-x-1 top-7 rounded bg-primary/85 px-1 py-0.5 text-center text-[9px] font-bold text-primary-foreground">
                {Math.round(probability * 100)} %
              </span>
            )}
            <span className="absolute bottom-1 left-1 flex max-w-[calc(100%-8px)] flex-wrap gap-0.5">
              {resources.map(resource => <span key={resource.id} className="rounded bg-primary px-1 text-[8px] font-bold text-primary-foreground" title={resource.kind}>{resource.kind.slice(0, 3).toUpperCase()}</span>)}
            </span>
            {sites.length > 0 && (
              <span className="absolute bottom-1 right-1 flex h-5 min-w-5 items-center justify-center rounded bg-background/85 px-1 text-foreground" title={`${sites.length} staveb`}>
                <Pickaxe className="h-3.5 w-3.5" /><span className="text-[9px] font-bold">{sites.length}</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
