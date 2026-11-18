import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Castle, Download, Eraser, FileJson, Flag, Gem, Layers3, Loader2, Map, Mountain,
  MousePointer2, Pickaxe, Play, Plus, Redo2, Route, Save, Swords, Trash2, Undo2, Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScenarioMap, ScenarioMicroGrid, type EditorSelection } from "@/components/editor/ScenarioMap";
import {
  MICRO_BIOME_LABEL, SCENARIO_BIOMES, SITE_OPTIONS, armyProblem, armySoldiers, cityProblem, cloneScenario, createEmptyScenario,
  createStarterScenario, paintBiome, parseScenario, roadProblem, scenarioDeposits, siteProblem, tileAt,
  type Scenario, type ScenarioArmy, type ScenarioBiome, type ScenarioCity, type ScenarioPoint,
} from "@/lib/scenarioSandbox";
import { runScenarioSimulation, type ScenarioSimulationResult } from "@/lib/scenarioSimulation";
import { MICRO_RESOURCE_LABEL, type MicroResourceKind } from "../../supabase/functions/_shared/microResources";
import { UNIT_TYPES, FORMATIONS, FORMATION_INFO } from "../../supabase/functions/_shared/fieldBattle";
import { UNIT_TYPE_LABELS } from "../../supabase/functions/_shared/unitTypes";
import { DEPOSIT_LABEL } from "../../supabase/functions/_shared/geology";

const CURRENT_KEY = "chronicle.scenario.current.v1";
const LIBRARY_KEY = "chronicle.scenario.library.v1";
type EditorTool = "select" | "terrain" | "city" | "army" | "road" | "resource" | "site" | "erase";
type ViewMode = "macro" | "micro";
type Library = Record<string, Scenario>;

const TOOLS: Array<{ id: EditorTool; label: string; icon: typeof Map }> = [
  { id: "select", label: "Vybrat", icon: MousePointer2 },
  { id: "terrain", label: "Terén", icon: Mountain },
  { id: "city", label: "Město", icon: Castle },
  { id: "army", label: "Armáda", icon: Swords },
  { id: "road", label: "Cesta", icon: Route },
  { id: "resource", label: "Surovina", icon: Gem },
  { id: "site", label: "Těžba", icon: Pickaxe },
  { id: "erase", label: "Guma", icon: Eraser },
];
const RESOURCE_KINDS = Object.keys(MICRO_RESOURCE_LABEL) as MicroResourceKind[];
const makeId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

function loadInitial(): Scenario {
  try {
    const current = localStorage.getItem(CURRENT_KEY);
    if (current) return parseScenario(current);
  } catch { /* a broken local draft must not blank the editor */ }
  return createStarterScenario();
}
function loadLibrary(): Library {
  try { return JSON.parse(localStorage.getItem(LIBRARY_KEY) || "{}") as Library; }
  catch { return {}; }
}

const ScenarioEditor = () => {
  const navigate = useNavigate();
  const [scenario, setScenario] = useState<Scenario>(loadInitial);
  const [library, setLibrary] = useState<Library>(loadLibrary);
  const [savedId, setSavedId] = useState("");
  const [past, setPast] = useState<Scenario[]>([]);
  const [future, setFuture] = useState<Scenario[]>([]);
  const [tool, setTool] = useState<EditorTool>("select");
  const [mode, setMode] = useState<ViewMode>("macro");
  const [biome, setBiome] = useState<ScenarioBiome>("plains");
  const [microBiome, setMicroBiome] = useState("grassland");
  const [brush, setBrush] = useState(1);
  const [owner, setOwner] = useState("Hráč");
  const [unitType, setUnitType] = useState<typeof UNIT_TYPES[number]>("SWORDSMEN");
  const [unitCount, setUnitCount] = useState(400);
  const [resourceKind, setResourceKind] = useState<MicroResourceKind>("iron");
  const [siteRecipe, setSiteRecipe] = useState("harvest_wheat");
  const [overlayKind, setOverlayKind] = useState<MicroResourceKind | null>(null);
  const [selectedTile, setSelectedTile] = useState<ScenarioPoint | null>({ x: 2, y: 2 });
  const [selectedMicro, setSelectedMicro] = useState<{ mx: number; my: number } | null>(null);
  const [selection, setSelection] = useState<EditorSelection>(null);
  const [roadDraft, setRoadDraft] = useState<ScenarioPoint | null>(null);
  const [result, setResult] = useState<ScenarioSimulationResult | null>(null);
  const [running, setRunning] = useState<"battle" | "extraction" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const deposits = useMemo(() => scenarioDeposits(scenario), [scenario]);
  const activeTile = selectedTile ? tileAt(scenario, selectedTile.x, selectedTile.y) ?? null : null;
  const selectedArmy = selection?.kind === "army" ? scenario.armies.find(a => a.id === selection.id) ?? null : null;
  const selectedCity = selection?.kind === "city" ? scenario.cities.find(c => c.id === selection.id) ?? null : null;
  const selectedRoad = selection?.kind === "road" ? scenario.roads.find(r => r.id === selection.id) ?? null : null;
  const selectedSite = selection?.kind === "site" ? scenario.sites.find(s => s.id === selection.id) ?? null : null;

  useEffect(() => {
    try { localStorage.setItem(CURRENT_KEY, JSON.stringify(scenario)); }
    catch { toast.error("Místní úložiště je plné; scénář exportuj do souboru"); }
  }, [scenario]);

  const commit = (recipe: (current: Scenario) => Scenario, history = true) => {
    setScenario(current => {
      const next = recipe(current);
      if (next === current) return current;
      if (history) {
        setPast(items => [...items.slice(-39), cloneScenario(current)]);
        setFuture([]);
      }
      return next;
    });
  };
  const undo = () => {
    if (!past.length) return;
    const previous = past[past.length - 1];
    setPast(items => items.slice(0, -1));
    setFuture(items => [cloneScenario(scenario), ...items].slice(0, 40));
    setScenario(previous);
    setSelection(null);
  };
  const redo = () => {
    if (!future.length) return;
    const next = future[0];
    setFuture(items => items.slice(1));
    setPast(items => [...items, cloneScenario(scenario)].slice(-40));
    setScenario(next);
    setSelection(null);
  };
  const chooseTool = (next: EditorTool) => {
    setTool(next);
    setRoadDraft(null);
    if ((next === "resource" || next === "site") && activeTile) setMode("micro");
    if (next !== "resource" && next !== "site" && mode === "micro" && (next === "city" || next === "army" || next === "road")) setMode("macro");
  };
  const selectEntity = (next: EditorSelection) => {
    setSelection(next);
    setSelectedMicro(null);
    if (!next) return;
    if (next.kind === "tile") {
      const [x, y] = next.id.split(",").map(Number);
      setSelectedTile({ x, y });
      return;
    }
    if (next.kind === "city") {
      const entity = scenario.cities.find(c => c.id === next.id); if (entity) setSelectedTile(entity);
    } else if (next.kind === "army") {
      const entity = scenario.armies.find(a => a.id === next.id); if (entity) setSelectedTile(entity);
    } else if (next.kind === "site") {
      const entity = scenario.sites.find(s => s.id === next.id); if (entity) { setSelectedTile(entity); setSelectedMicro(entity); }
    }
  };
  const nearestCity = (p: ScenarioPoint): ScenarioCity | undefined => scenario.cities.slice().sort((a, b) =>
    (Math.abs(a.x - p.x) + Math.abs(a.y - p.y)) - (Math.abs(b.x - p.x) + Math.abs(b.y - p.y)) || a.id.localeCompare(b.id))[0];

  const handleCell = (x: number, y: number, dragging: boolean) => {
    const p = { x, y };
    setSelectedTile(p);
    setSelectedMicro(null);
    if (dragging && tool !== "terrain") return;
    if (tool === "select") { setSelection({ kind: "tile", id: `${x},${y}` }); return; }
    if (tool === "terrain") {
      commit(current => paintBiome(current, x, y, biome, brush), !dragging);
      setSelection({ kind: "tile", id: `${x},${y}` });
      return;
    }
    if (tool === "city") {
      const problem = cityProblem(scenario, p);
      if (problem) { if (!dragging) toast.error(problem); return; }
      const city: ScenarioCity = { id: makeId("city"), name: `Nové město ${scenario.cities.length + 1}`, owner, population: 1000, x, y };
      commit(current => ({ ...current, cities: [...current.cities, city] }));
      setSelection({ kind: "city", id: city.id });
      toast.success(`${city.name} umístěno zdarma`);
      return;
    }
    if (tool === "army") {
      const problem = armyProblem(scenario, p);
      if (problem) { if (!dragging) toast.error(problem); return; }
      const count = Math.max(1, Math.min(100000, Math.floor(unitCount)));
      const army: ScenarioArmy = { id: makeId("army"), name: `Armáda ${scenario.armies.length + 1}`, owner, morale: 70, formation: "line", x, y,
        composition: [{ id: makeId("unit"), unit_type: unitType, manpower: count }] };
      commit(current => ({ ...current, armies: [...current.armies, army] }));
      setSelection({ kind: "army", id: army.id });
      toast.success("Armáda umístěna bez náborových nákladů");
      return;
    }
    if (tool === "road") {
      if (!roadDraft) { setRoadDraft(p); toast.info("Začátek cesty uložen; vyber sousední cíl"); return; }
      const problem = roadProblem(scenario, roadDraft, p);
      if (problem) { toast.error(problem); setRoadDraft(p); return; }
      const road = { id: makeId("road"), owner, level: 1, from: roadDraft, to: p };
      commit(current => ({ ...current, roads: [...current.roads, road] }));
      setSelection({ kind: "road", id: road.id });
      setRoadDraft(null);
      return;
    }
    if (tool === "resource" || tool === "site") {
      setMode("micro");
      toast.info("Vyber konkrétní mikropolíčko v detailu 6×6");
      return;
    }
    if (tool === "erase") {
      const removedCityIds = scenario.cities.filter(c => c.x === x && c.y === y).map(c => c.id);
      commit(current => ({
        ...current,
        cities: current.cities.filter(c => c.x !== x || c.y !== y),
        armies: current.armies.filter(a => a.x !== x || a.y !== y),
        roads: current.roads.filter(r => (r.from.x !== x || r.from.y !== y) && (r.to.x !== x || r.to.y !== y)),
        resources: current.resources.filter(r => r.x !== x || r.y !== y),
        sites: current.sites.filter(s => (s.x !== x || s.y !== y) && !removedCityIds.includes(s.cityId)),
      }));
      setSelection({ kind: "tile", id: `${x},${y}` });
    }
  };

  const handleMicroCell = (mx: number, my: number) => {
    if (!activeTile) return;
    const { x, y } = activeTile;
    setSelectedMicro({ mx, my });
    if (tool === "select") {
      const site = scenario.sites.find(s => s.x === x && s.y === y && s.mx === mx && s.my === my);
      setSelection(site ? { kind: "site", id: site.id } : { kind: "tile", id: `${x},${y}` });
      return;
    }
    if (tool === "terrain") {
      commit(current => ({ ...current, tiles: current.tiles.map(tile => tile.x === x && tile.y === y
        ? { ...tile, micro: tile.micro.map((value, index) => index === my * 6 + mx ? microBiome : value) } : tile) }));
      return;
    }
    if (tool === "resource") {
      const resource = { id: makeId("resource"), kind: resourceKind, amount: resourceKind === "gold" ? 80 : 500, x, y, mx, my };
      commit(current => ({ ...current, resources: [...current.resources.filter(r => !(r.x === x && r.y === y && r.mx === mx && r.my === my && r.kind === resourceKind)), resource] }));
      toast.success(`${MICRO_RESOURCE_LABEL[resourceKind]} potvrzena na mikropolíčku`);
      return;
    }
    if (tool === "site") {
      if (scenario.sites.some(s => s.x === x && s.y === y && s.mx === mx && s.my === my)) { toast.error("Na mikropolíčku už stojí těžební stavba"); return; }
      const city = nearestCity(activeTile);
      if (!city) { toast.error("Nejdřív umísti město"); return; }
      const site = { id: makeId("site"), cityId: city.id, owner: city.owner, recipe: siteRecipe, level: 1, x, y, mx, my };
      const problem = siteProblem(scenario, site);
      if (problem) { toast.error(problem); return; }
      commit(current => ({ ...current, sites: [...current.sites, site] }));
      setSelection({ kind: "site", id: site.id });
      toast.success("Stavba umístěna zdarma");
      return;
    }
    if (tool === "erase") {
      commit(current => ({
        ...current,
        resources: current.resources.filter(r => !(r.x === x && r.y === y && r.mx === mx && r.my === my)),
        sites: current.sites.filter(s => !(s.x === x && s.y === y && s.mx === mx && s.my === my)),
      }));
      setSelection({ kind: "tile", id: `${x},${y}` });
      return;
    }
    setMode("macro");
    toast.info("Tento objekt se umisťuje na makro mapě");
  };

  const deleteSelection = () => {
    if (!selection || selection.kind === "tile") return;
    commit(current => ({
      ...current,
      cities: selection.kind === "city" ? current.cities.filter(c => c.id !== selection.id) : current.cities,
      armies: selection.kind === "army" ? current.armies.filter(a => a.id !== selection.id) : current.armies,
      roads: selection.kind === "road" ? current.roads.filter(r => r.id !== selection.id) : current.roads,
      sites: current.sites.filter(s => selection.kind === "site" ? s.id !== selection.id : selection.kind === "city" ? s.cityId !== selection.id : true),
    }));
    setSelection(null);
  };
  const reinforce = () => {
    if (!selectedArmy) return;
    const amount = Math.max(1, Math.min(100000, Math.floor(unitCount)));
    commit(current => ({ ...current, armies: current.armies.map(army => {
      if (army.id !== selectedArmy.id) return army;
      const exists = army.composition.some(row => row.unit_type === unitType);
      return { ...army, composition: exists
        ? army.composition.map(row => row.unit_type === unitType ? { ...row, manpower: row.manpower + amount } : row)
        : [...army.composition, { id: makeId("unit"), unit_type: unitType, manpower: amount }] };
    }) }));
    toast.success(`${amount} vojáků přidáno zdarma`);
  };
  const save = () => {
    const id = savedId || makeId("scenario");
    const next = { ...library, [id]: cloneScenario(scenario) };
    setLibrary(next);
    setSavedId(id);
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(next));
    toast.success("Scénář uložen v tomto prohlížeči");
  };
  const load = (id: string) => {
    setSavedId(id);
    if (!id || !library[id]) return;
    commit(() => cloneScenario(library[id]));
    setSelection(null);
    setResult(null);
    toast.success("Scénář načten");
  };
  const newScenario = () => {
    commit(() => createEmptyScenario(scenario.width, scenario.height, scenario.seed));
    setSavedId("");
    setSelection(null);
    setSelectedTile({ x: 0, y: 0 });
    setMode("macro");
    setResult(null);
    toast.success("Prázdná mapa je připravena; původní stav vrátíš Zpět");
  };
  const exportScenario = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(scenario, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${scenario.name.toLowerCase().replace(/[^a-z0-9]+/gi, "-") || "scenario"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const importScenario = async (file: File | undefined) => {
    if (!file) return;
    try {
      const imported = parseScenario(await file.text());
      commit(() => imported);
      setSavedId("");
      setSelection(null);
      setResult(null);
      toast.success("Scénář importován");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Import selhal"); }
    if (fileRef.current) fileRef.current.value = "";
  };
  const simulate = async (kind: "battle" | "extraction") => {
    setRunning(kind);
    try {
      const next = await runScenarioSimulation(kind, scenario, selectedArmy?.id);
      setResult(next);
      if (next.kind === "battle") toast.success(`Bitva dokončena po ${next.rounds} kolech`);
      else toast.success("Kapacita těžby přepočítána");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Simulace selhala"); }
    finally { setRunning(null); }
  };

  return (
    <div className="map-first-shell min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-primary/20 bg-background/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 lg:px-5">
          <Button variant="ghost" size="icon" onClick={() => navigate("/games")} aria-label="Zpět na moje světy"><ArrowLeft className="h-5 w-5" /></Button>
          <div className="mr-1 hidden items-center gap-2 md:flex"><Map className="h-5 w-5 text-primary" /><span className="font-display text-sm font-bold">Editor scénářů</span></div>
          <Input value={scenario.name} onChange={event => commit(current => ({ ...current, name: event.target.value }), false)} className="h-9 w-44 font-display sm:w-56" aria-label="Název scénáře" />
          <Badge variant="outline" className="border-success/40 text-success">Lokální sandbox</Badge>
          <div className="ml-auto flex flex-wrap items-center gap-1">
            <Button variant="ghost" size="icon" onClick={undo} disabled={!past.length} aria-label="Zpět"><Undo2 className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={redo} disabled={!future.length} aria-label="Znovu"><Redo2 className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={newScenario}><Plus className="mr-1 h-4 w-4" />Nová</Button>
            <Button variant="outline" size="sm" onClick={save}><Save className="mr-1 h-4 w-4" />Uložit</Button>
            <Button variant="ghost" size="icon" onClick={exportScenario} aria-label="Exportovat JSON"><Download className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => fileRef.current?.click()} aria-label="Importovat JSON"><Upload className="h-4 w-4" /></Button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={event => importScenario(event.target.files?.[0])} />
          </div>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-57px)] grid-cols-1 xl:grid-cols-[236px_minmax(0,1fr)_330px]">
        <aside className="border-b border-primary/15 bg-card/45 p-3 xl:border-b-0 xl:border-r">
          <div className="grid grid-cols-4 gap-1.5 xl:grid-cols-2">
            {TOOLS.map(item => {
              const Icon = item.icon;
              return <Button key={item.id} variant={tool === item.id ? "default" : "outline"} size="sm" className="justify-start px-2" onClick={() => chooseTool(item.id)}>
                <Icon className="mr-1.5 h-4 w-4" />{item.label}
              </Button>;
            })}
          </div>
          <div className="mt-4 space-y-3 border-t border-border pt-3">
            {tool === "terrain" && (
              <>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">{mode === "micro" ? "Mikrobiom" : "Makrobiom"}</label>
                  {mode === "macro" ? <div className="grid grid-cols-2 gap-1.5">
                    {(Object.keys(SCENARIO_BIOMES) as ScenarioBiome[]).map(key => <Button key={key} variant={biome === key ? "secondary" : "ghost"} size="sm" className="justify-start border border-border" onClick={() => setBiome(key)}>{SCENARIO_BIOMES[key].label}</Button>)}
                  </div> : <Select value={microBiome} onValueChange={setMicroBiome}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                    {Object.entries(MICRO_BIOME_LABEL).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
                  </SelectContent></Select>}
                </div>
                {mode === "macro" && <div><label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Velikost štětce</label><div className="flex gap-1">{[1, 2, 3].map(size => <Button key={size} variant={brush === size ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setBrush(size)}>{size}</Button>)}</div></div>}
                <p className="text-xs leading-relaxed text-muted-foreground">Na makro mapě maluj tažením. Změna makro biomu připraví nových 36 mikropolíček; Zpět vrátí předchozí stav.</p>
              </>
            )}
            {(tool === "city" || tool === "army" || tool === "road") && <div><label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Vlastník nového objektu</label><Select value={owner} onValueChange={setOwner}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Hráč", "Frakce 1", "Frakce 2", "Neutrál"].map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select></div>}
            {tool === "army" && <ArmyUnitControls unitType={unitType} setUnitType={setUnitType} unitCount={unitCount} setUnitCount={setUnitCount} />}
            {tool === "road" && <p className="rounded-md border border-primary/20 bg-primary/5 p-2 text-xs text-muted-foreground">Klikni na začátek a potom na sousední pole stranou. Cesty propojují těžbu s městy a jsou zdarma.</p>}
            {tool === "resource" && <div><label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Potvrzená surovina</label><Select value={resourceKind} onValueChange={value => setResourceKind(value as MicroResourceKind)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RESOURCE_KINDS.map(kind => <SelectItem key={kind} value={kind}>{MICRO_RESOURCE_LABEL[kind]}</SelectItem>)}</SelectContent></Select><p className="mt-2 text-xs text-muted-foreground">V detailu 6×6 kliknutím potvrdíš konkrétní nález, nejen pravděpodobnost.</p></div>}
            {tool === "site" && <div><label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Těžební stavba</label><Select value={siteRecipe} onValueChange={setSiteRecipe}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(SITE_OPTIONS).map(([key, option]) => <SelectItem key={key} value={key}>{option.label}</SelectItem>)}</SelectContent></Select><p className="mt-2 text-xs text-muted-foreground">Stavba vyžaduje město a potvrzenou surovinu podle stejného pravidla jako živá hra.</p></div>}
            {tool === "erase" && <p className="text-xs text-muted-foreground">Na makro mapě odstraní objekty pole. V detailu odstraní suroviny a stavbu jednoho mikropolíčka.</p>}
          </div>
          <div className="mt-4 border-t border-border pt-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold"><Layers3 className="h-4 w-4 text-primary" />Pravděpodobnost surovin</div>
            <Select value={overlayKind ?? "none"} onValueChange={value => setOverlayKind(value === "none" ? null : value as MicroResourceKind)}><SelectTrigger><SelectValue placeholder="Vrstva vypnuta" /></SelectTrigger><SelectContent>
              <SelectItem value="none">Vrstva vypnuta</SelectItem>
              {RESOURCE_KINDS.map(kind => <SelectItem key={kind} value={kind}>{MICRO_RESOURCE_LABEL[kind]}</SelectItem>)}
            </SelectContent></Select>
            {overlayKind && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Zlatá vrstva ukazuje 0–100 %. Jisté zdroje mají 100 %; rudy respektují makro ložiska a mikrobiom.</p>}
          </div>
          <div className="mt-4 border-t border-border pt-3">
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Uložené scénáře</label>
            <Select value={savedId} onValueChange={load}><SelectTrigger><SelectValue placeholder="Vyber scénář" /></SelectTrigger><SelectContent>{Object.entries(library).map(([id, saved]) => <SelectItem key={id} value={id}>{saved.name}</SelectItem>)}</SelectContent></Select>
          </div>
        </aside>

        <main className="min-w-0 p-3 lg:p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border border-border bg-card p-1">
              <Button variant={mode === "macro" ? "default" : "ghost"} size="sm" onClick={() => setMode("macro")}>Makro mapa</Button>
              <Button variant={mode === "micro" ? "default" : "ghost"} size="sm" disabled={!activeTile} onClick={() => setMode("micro")}>Mikropolíčka 6×6</Button>
            </div>
            {activeTile && <Badge variant="outline">Pole {activeTile.x}, {activeTile.y} · {SCENARIO_BIOMES[activeTile.biome].label}</Badge>}
            {roadDraft && <Badge className="bg-primary text-primary-foreground">Cesta z {roadDraft.x},{roadDraft.y}</Badge>}
            <span className="ml-auto text-xs text-muted-foreground">{scenario.width}×{scenario.height} makropolí · {scenario.width * scenario.height * 36} mikropolíček</span>
          </div>
          {mode === "macro" || !activeTile ? (
            <ScenarioMap scenario={scenario} deposits={deposits} selectedTile={selectedTile} roadDraft={roadDraft} selection={selection} overlayKind={overlayKind} onCell={handleCell} onStrokeStart={() => undefined} onSelect={selectEntity} />
          ) : (
            <div className="space-y-3">
              <ScenarioMicroGrid scenario={scenario} tile={activeTile} deposits={deposits} overlayKind={overlayKind} onMicroCell={handleMicroCell} />
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card/60 p-3 text-xs text-muted-foreground">
                <span>Kliknutí použije nástroj <strong className="text-foreground">{TOOLS.find(item => item.id === tool)?.label}</strong>. Pro jisté suroviny a stavby pracuješ přímo v jednotlivých mikropolíčkách.</span>
                {selectedMicro && <Badge variant="outline">Mikro {selectedMicro.mx},{selectedMicro.my} · {MICRO_BIOME_LABEL[activeTile.micro[selectedMicro.my * 6 + selectedMicro.mx]]}</Badge>}
              </div>
            </div>
          )}
        </main>

        <aside className="min-w-0 border-t border-primary/15 bg-card/45 p-3 xl:border-l xl:border-t-0">
          <div className="space-y-4">
            <section>
              <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-bold">Vlastnosti</h2>{selection && selection.kind !== "tile" && <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={deleteSelection} aria-label="Smazat výběr"><Trash2 className="h-4 w-4" /></Button>}</div>
              {selectedCity ? <div className="space-y-2">
                <Input value={selectedCity.name} onChange={event => commit(current => ({ ...current, cities: current.cities.map(c => c.id === selectedCity.id ? { ...c, name: event.target.value } : c) }), false)} aria-label="Název města" />
                <label className="block text-xs text-muted-foreground">Vlastník<Input value={selectedCity.owner} onChange={event => commit(current => ({ ...current, cities: current.cities.map(c => c.id === selectedCity.id ? { ...c, owner: event.target.value } : c) }), false)} className="mt-1" /></label>
                <label className="block text-xs text-muted-foreground">Obyvatelstvo<Input type="number" min="0" value={selectedCity.population} onChange={event => commit(current => ({ ...current, cities: current.cities.map(c => c.id === selectedCity.id ? { ...c, population: Math.max(0, Number(event.target.value) || 0) } : c) }), false)} className="mt-1" /></label>
                <Button variant="outline" size="sm" className="w-full" onClick={() => { setSelectedTile(selectedCity); setMode("micro"); }}>Otevřít 6×6 detail</Button>
              </div> : selectedArmy ? <div className="space-y-2">
                <Input value={selectedArmy.name} onChange={event => commit(current => ({ ...current, armies: current.armies.map(a => a.id === selectedArmy.id ? { ...a, name: event.target.value } : a) }), false)} aria-label="Název armády" />
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-muted-foreground">Vlastník<Input value={selectedArmy.owner} onChange={event => commit(current => ({ ...current, armies: current.armies.map(a => a.id === selectedArmy.id ? { ...a, owner: event.target.value } : a) }), false)} className="mt-1" /></label>
                  <label className="text-xs text-muted-foreground">Morálka<Input type="number" min="0" max="100" value={selectedArmy.morale} onChange={event => commit(current => ({ ...current, armies: current.armies.map(a => a.id === selectedArmy.id ? { ...a, morale: Math.max(0, Math.min(100, Number(event.target.value) || 0)) } : a) }), false)} className="mt-1" /></label>
                </div>
                <label className="block text-xs text-muted-foreground">Formace<Select value={selectedArmy.formation} onValueChange={value => commit(current => ({ ...current, armies: current.armies.map(a => a.id === selectedArmy.id ? { ...a, formation: value as ScenarioArmy["formation"] } : a) }), false)}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{FORMATIONS.map(formation => <SelectItem key={formation} value={formation}>{FORMATION_INFO[formation].label}</SelectItem>)}</SelectContent></Select></label>
                <div className="rounded-md border border-border bg-background/40 p-2">
                  <div className="mb-2 flex justify-between text-xs font-semibold"><span>Složení</span><span>{armySoldiers(selectedArmy).toLocaleString("cs-CZ")} mužů</span></div>
                  <div className="max-h-44 space-y-1.5 overflow-y-auto">
                    {selectedArmy.composition.map(row => <div key={row.id} className="grid grid-cols-[1fr_82px_28px] items-center gap-1.5 text-xs">
                      <span className="truncate">{UNIT_TYPE_LABELS[row.unit_type]}</span>
                      <Input type="number" min="0" value={row.manpower} className="h-7 px-2" onChange={event => commit(current => ({ ...current, armies: current.armies.map(a => a.id === selectedArmy.id ? { ...a, composition: a.composition.map(item => item.id === row.id ? { ...item, manpower: Math.max(0, Number(event.target.value) || 0) } : item) } : a) }), false)} aria-label={`Počet ${UNIT_TYPE_LABELS[row.unit_type]}`} />
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => commit(current => ({ ...current, armies: current.armies.map(a => a.id === selectedArmy.id ? { ...a, composition: a.composition.filter(item => item.id !== row.id) } : a) }))} aria-label="Odebrat oddíl"><Trash2 className="h-3 w-3" /></Button>
                    </div>)}
                  </div>
                  <div className="mt-2 border-t border-border pt-2"><ArmyUnitControls unitType={unitType} setUnitType={setUnitType} unitCount={unitCount} setUnitCount={setUnitCount} compact /><Button size="sm" variant="outline" className="mt-2 w-full" onClick={reinforce}><Plus className="mr-1 h-3.5 w-3.5" />Přidat vojáky zdarma</Button></div>
                </div>
              </div> : selectedRoad ? <div className="space-y-2 text-sm">
                <p className="font-semibold">Cesta {selectedRoad.from.x},{selectedRoad.from.y} → {selectedRoad.to.x},{selectedRoad.to.y}</p>
                <label className="block text-xs text-muted-foreground">Vlastník<Input value={selectedRoad.owner} onChange={event => commit(current => ({ ...current, roads: current.roads.map(r => r.id === selectedRoad.id ? { ...r, owner: event.target.value } : r) }), false)} className="mt-1" /></label>
                <p className="text-xs text-muted-foreground">Dokončená cesta umožní plnou dopravu z propojené těžby do města stejného vlastníka.</p>
              </div> : selectedSite ? <div className="space-y-2 text-sm">
                <p className="font-semibold">{SITE_OPTIONS[selectedSite.recipe].label}</p>
                <p className="text-xs text-muted-foreground">Mikropolíčko {selectedSite.mx},{selectedSite.my} · město {scenario.cities.find(c => c.id === selectedSite.cityId)?.name}</p>
                <label className="block text-xs text-muted-foreground">Úroveň<Input type="number" min="1" max="5" value={selectedSite.level} onChange={event => commit(current => ({ ...current, sites: current.sites.map(s => s.id === selectedSite.id ? { ...s, level: Math.max(1, Math.min(5, Number(event.target.value) || 1)) } : s) }), false)} className="mt-1" /></label>
              </div> : activeTile ? <div className="space-y-3 text-sm">
                <div><p className="font-semibold">Pole {activeTile.x},{activeTile.y}</p><p className="text-xs text-muted-foreground">{SCENARIO_BIOMES[activeTile.biome].label}</p></div>
                <Button variant="outline" size="sm" className="w-full" onClick={() => setMode("micro")}>Upravit 36 mikropolíček</Button>
                <div><p className="mb-1 text-xs font-semibold text-muted-foreground">Makro ložiska pro tento seed</p>{(deposits.get(`${activeTile.x},${activeTile.y}`) ?? []).length ? <div className="flex flex-wrap gap-1">{(deposits.get(`${activeTile.x},${activeTile.y}`) ?? []).map((deposit, index) => <Badge key={`${deposit.kind}-${index}`} variant="secondary">{DEPOSIT_LABEL[deposit.kind]} · st. {deposit.grade}</Badge>)}</div> : <p className="text-xs text-muted-foreground">Žádné vygenerované ložisko. V detailu můžeš potvrdit vlastní surovinu.</p>}</div>
              </div> : <p className="text-xs text-muted-foreground">Vyber pole nebo objekt na mapě.</p>}
            </section>

            <section className="border-t border-border pt-3">
              <label className="block text-xs font-semibold text-muted-foreground">Seed geologie<Input value={scenario.seed} onChange={event => commit(current => ({ ...current, seed: event.target.value.slice(0, 80) }), false)} className="mt-1 font-mono text-xs" /></label>
              <p className="mt-1 text-[11px] text-muted-foreground">Stejný seed a mapa dají stejná makro ložiska i opakovatelnou bitvu.</p>
            </section>

            <section className="border-t border-border pt-3">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-bold"><Play className="h-4 w-4 text-primary" />Simulace scénáře</h2>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" onClick={() => simulate("battle")} disabled={!selectedArmy || running !== null}>{running === "battle" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Swords className="mr-1 h-4 w-4" />}Bitva</Button>
                <Button size="sm" variant="outline" onClick={() => simulate("extraction")} disabled={running !== null}>{running === "extraction" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Pickaxe className="mr-1 h-4 w-4" />}Těžba</Button>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Bitvu spustíš z vybrané armády proti nejbližšímu nepříteli v dosahu. Simulace běží odděleně a nijak nemění živé hry.</p>
              {result?.kind === "battle" && <BattleResult result={result} scenario={scenario} />}
              {result?.kind === "extraction" && <ExtractionResult result={result} />}
            </section>
          </div>
        </aside>
      </div>
    </div>
  );
};

function ArmyUnitControls({ unitType, setUnitType, unitCount, setUnitCount, compact = false }: {
  unitType: typeof UNIT_TYPES[number]; setUnitType: (type: typeof UNIT_TYPES[number]) => void;
  unitCount: number; setUnitCount: (count: number) => void; compact?: boolean;
}) {
  return <div className={compact ? "grid grid-cols-[1fr_76px] gap-1.5" : "space-y-2"}>
    <Select value={unitType} onValueChange={value => setUnitType(value as typeof UNIT_TYPES[number])}><SelectTrigger className={compact ? "h-8 text-xs" : ""}><SelectValue /></SelectTrigger><SelectContent>{UNIT_TYPES.map(type => <SelectItem key={type} value={type}>{UNIT_TYPE_LABELS[type]}</SelectItem>)}</SelectContent></Select>
    <Input type="number" min="1" max="100000" value={unitCount} onChange={event => setUnitCount(Math.max(1, Number(event.target.value) || 1))} className={compact ? "h-8 px-2 text-xs" : ""} aria-label="Počet vojáků" />
  </div>;
}

function BattleResult({ result, scenario }: { result: Extract<ScenarioSimulationResult, { kind: "battle" }>; scenario: Scenario }) {
  const winner = result.winner === "draw" ? "Remíza" : scenario.armies.find(a => a.id === result.winner)?.name ?? result.winner;
  return <div className="mt-3 space-y-2 rounded-md border border-primary/20 bg-background/50 p-2.5">
    <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">Vítěz: {winner}</span><Badge variant="outline">{result.rounds} kol</Badge></div>
    {result.armies.map(army => <div key={army.id} className="grid grid-cols-[1fr_auto] gap-2 text-xs"><span className="truncate">{army.name}</span><span className="text-muted-foreground">−{army.losses} · zůstalo {army.survivors}</span></div>)}
    <details className="text-xs"><summary className="cursor-pointer font-semibold text-primary">Hlášení z bitvy ({result.events.length})</summary><div className="mt-2 max-h-52 space-y-1 overflow-y-auto border-t border-border pt-2">{result.events.slice(-50).reverse().map((event, index) => <p key={`${event.round}-${event.seq}-${index}`} className="text-muted-foreground"><span className="font-mono text-foreground">K{event.round}</span> · {event.text}</p>)}</div></details>
  </div>;
}

function ExtractionResult({ result }: { result: Extract<ScenarioSimulationResult, { kind: "extraction" }> }) {
  return <div className="mt-3 space-y-2 rounded-md border border-primary/20 bg-background/50 p-2.5 text-xs">
    <p className="text-[11px] text-muted-foreground">Fyzická kapacita za tah při plném obsazení; ne fiskální výnos ani garantovaná produkce.</p>
    {result.totals.length > 0 && <div className="flex flex-wrap gap-1">{result.totals.map(total => <Badge key={total.good} variant="secondary">{total.good}: {total.capacityPerTurn}</Badge>)}</div>}
    <div className="max-h-64 space-y-1.5 overflow-y-auto">{result.rows.length ? result.rows.map(row => <div key={row.siteId} className="rounded border border-border p-2">
      <div className="flex justify-between gap-2"><span>{SITE_OPTIONS[row.recipe]?.label}</span><strong>{row.reason ? "0" : row.capacityPerTurn}</strong></div>
      <p className="text-[11px] text-muted-foreground">{row.cityName} · {row.good ?? "bez výstupu"} · doprava {row.transport}{row.jobs ? ` · ${row.jobs} pracovníků` : ""}</p>
      {row.reason && <p className="mt-1 text-[11px] text-destructive">{row.reason}</p>}
    </div>) : <p className="text-muted-foreground">Ve scénáři zatím nejsou těžební stavby.</p>}</div>
  </div>;
}

export default ScenarioEditor;
