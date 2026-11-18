import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { devAdminDb } from "@/lib/devAdminDb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScenarioMap, type EditorSelection } from "@/components/editor/ScenarioMap";
import { SCENARIO_BIOMES, type ScenarioBiome } from "@/lib/scenarioSandbox";
import { EDITOR_TO_DB, computeStackPower, liveToScenario, type LiveCity, type LiveComp, type LiveHex, type LiveStack } from "@/lib/liveGameEditor";
import { UNIT_TYPES, UNIT_TYPE_LABELS } from "../../supabase/functions/_shared/unitTypes";

type Tool = "select" | "paint" | "army" | "move";
const TOOLS: Array<[Tool, string]> = [["select", "Vybrat"], ["paint", "Malovat terén"], ["army", "Nová armáda"], ["move", "Přesunout armádu"]];

async function readAll<T>(table: string, cols: string, sessionId: string, extra?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    let q: any = supabase.from(table as never).select(cols).eq("session_id", sessionId).range(from, from + 999);
    if (extra) q = extra(q);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...(data as T[]));
    if (!data || data.length < 1000) return out;
  }
}

export default function LiveGameEditor() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const db = useMemo(() => devAdminDb(sessionId), [sessionId]);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [data, setData] = useState<{ hexes: LiveHex[]; cities: LiveCity[]; stacks: LiveStack[]; comps: LiveComp[]; players: string[]; name: string } | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [biome, setBiome] = useState<ScenarioBiome>("plains");
  const [owner, setOwner] = useState("");
  const [selection, setSelection] = useState<EditorSelection>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => { (async () => {
    const { data: u } = await supabase.auth.getUser();
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", u.user?.id ?? "").eq("role", "admin");
    setIsAdmin(!!roles?.length);
  })(); }, []);

  const load = useCallback(async () => {
    const [hexes, cities, stacks, players, session] = await Promise.all([
      readAll<LiveHex>("province_hexes", "grid_x, grid_y, biome_family", sessionId),
      readAll<LiveCity>("cities", "id, name, owner_player, population_total, grid_x, grid_y", sessionId),
      readAll<LiveStack>("military_stacks", "id, name, player_name, morale, battle_formation, grid_x, grid_y", sessionId, q => q.eq("is_active", true)),
      readAll<{ player_name: string }>("game_players", "player_name", sessionId),
      supabase.from("game_sessions").select("room_code").eq("id", sessionId).maybeSingle(),
    ]);
    const ids = stacks.map(s => s.id);
    const comps: LiveComp[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data: rows } = await supabase.from("military_stack_composition").select("id, stack_id, unit_type, manpower").in("stack_id", ids.slice(i, i + 200));
      comps.push(...((rows ?? []) as LiveComp[]));
    }
    const names = players.map(p => p.player_name);
    setData({ hexes, cities, stacks, comps, players: names, name: (session.data as { room_code?: string } | null)?.room_code ?? "Hra" });
    setOwner(o => o || names[0] || "");
  }, [sessionId]);
  useEffect(() => { if (isAdmin) load().catch(e => toast.error(String(e.message ?? e))); }, [isAdmin, load]);

  const view = useMemo(() => data && data.hexes.length ? liveToScenario(data.name, data.hexes, data.cities, data.stacks, data.comps) : null, [data]);
  const deposits = useMemo(() => new Map(), []);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); toast.success(label); await load(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  const must = (r: { error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); };

  const onCell = (x: number, y: number) => {
    if (!view || busy) return;
    const gx = x + view.origin.x, gy = y + view.origin.y;
    if (tool === "paint") {
      const current = view.scenario.tiles.find(t => t.x === x && t.y === y);
      if (current?.biome === biome) return;
      void run(`Terén ${gx},${gy} změněn`, async () => must(await db.from("province_hexes").update({ biome_family: EDITOR_TO_DB[biome] }).eq("grid_x", gx).eq("grid_y", gy)));
    } else if (tool === "army") {
      if (!owner) return toast.error("Vyber vlastníka");
      void run("Armáda vytvořena", async () => {
        const rows = [{ unit_type: "MILITIA", manpower: 1000 }];
        const r = await db.from("military_stacks").insert({
          name: `Armáda ${owner}`, player_name: owner, owner_player: owner, grid_x: gx, grid_y: gy, hex_q: gx, hex_r: gy,
          is_active: true, is_deployed: true, morale: 70, battle_formation: "line", soldiers: 1000, unit_count: 5,
          power: computeStackPower(rows, 70),
        }).select("id").single();
        must(r);
        must(await db.from("military_stack_composition").insert(rows.map(c => ({ ...c, stack_id: (r.data as { id: string }).id }))));
      });
    } else if (tool === "move" && selection?.kind === "army") {
      const id = selection.id;
      void run(`Armáda přesunuta na ${gx},${gy}`, async () => must(await db.from("military_stacks").update({ grid_x: gx, grid_y: gy, hex_q: gx, hex_r: gy, parcel_index: null }).eq("id", id)));
    } else setSelection({ kind: "tile", id: `${x},${y}` });
  };

  const army = selection?.kind === "army" ? view?.scenario.armies.find(a => a.id === selection.id) : undefined;
  const city = selection?.kind === "city" ? view?.scenario.cities.find(c => c.id === selection.id) : undefined;
  useEffect(() => {
    if (army) setDraft({ name: army.name, morale: String(army.morale), ...Object.fromEntries(UNIT_TYPES.map(t => [t, String(army.composition.filter(c => c.unit_type === t).reduce((s, c) => s + c.manpower, 0))])) });
    else if (city) setDraft({ name: city.name, population: String(city.population) });
  }, [army?.id, city?.id, data]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveArmy = () => army && run("Armáda uložena", async () => {
    const rows = UNIT_TYPES.map(t => ({ unit_type: t, manpower: Math.max(0, Math.round(Number(draft[t]) || 0)) })).filter(r => r.manpower > 0);
    if (!rows.length) throw new Error("Armáda musí mít aspoň jednoho vojáka");
    const morale = Math.max(0, Math.min(100, Number(draft.morale) || 0));
    const soldiers = rows.reduce((s, r) => s + r.manpower, 0);
    must(await db.from("military_stack_composition").delete().eq("stack_id", army.id));
    must(await db.from("military_stack_composition").insert(rows.map(r => ({ ...r, stack_id: army.id }))));
    must(await db.from("military_stacks").update({ name: draft.name || army.name, morale, soldiers, unit_count: Math.ceil(soldiers / 200), power: computeStackPower(rows, morale) }).eq("id", army.id));
  });
  const deleteArmy = () => army && confirm(`Smazat ${army.name}?`) && run("Armáda smazána", async () => {
    must(await db.from("military_stack_composition").delete().eq("stack_id", army.id));
    must(await db.from("military_stacks").delete().eq("id", army.id));
    setSelection(null);
  });
  const saveCity = () => city && run("Město uloženo", async () => {
    const population = Math.max(0, Math.round(Number(draft.population) || 0));
    must(await db.from("cities").update({ name: draft.name || city.name, population_total: population }).eq("id", city.id));
  });

  if (isAdmin === false) return <div className="p-8 text-center"><p className="mb-4">Editor hry je jen pro administrátory.</p><Button onClick={() => navigate(`/game/${sessionId}`)}>Zpět do hry</Button></div>;
  if (!view) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <Button size="sm" variant="ghost" onClick={() => navigate(`/game/${sessionId}`)}><ArrowLeft className="mr-1 h-4 w-4" />Do hry</Button>
        <h1 className="font-display text-lg font-bold">★ Editor hry {view.scenario.name}</h1>
        <span className="text-xs text-muted-foreground">Změny se ukládají rovnou do hry a zapisují do admin historie.</span>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="w-72 shrink-0 space-y-4 overflow-y-auto border-r border-border p-3 text-sm">
          <div className="grid grid-cols-2 gap-1">
            {TOOLS.map(([t, label]) => <Button key={t} size="sm" variant={tool === t ? "default" : "outline"} onClick={() => setTool(t)}>{label}</Button>)}
          </div>
          {tool === "paint" && <div className="grid grid-cols-2 gap-1">{(Object.keys(SCENARIO_BIOMES) as ScenarioBiome[]).map(b => <Button key={b} size="sm" variant={biome === b ? "default" : "outline"} onClick={() => setBiome(b)}>{SCENARIO_BIOMES[b].label}</Button>)}</div>}
          {tool === "army" && <label className="block">Vlastník<select className="mt-1 w-full rounded border border-input bg-background p-1" value={owner} onChange={e => setOwner(e.target.value)}>{data!.players.map(p => <option key={p}>{p}</option>)}</select></label>}
          {tool === "move" && <p className="text-muted-foreground">{army ? `Klikni na cíl pro ${army.name}.` : "Nejdřív v nástroji Vybrat klikni na armádu."}</p>}
          {army && (
            <div className="space-y-2 rounded border border-border p-2">
              <p className="font-semibold">Armáda · {army.owner}</p>
              <Input value={draft.name ?? ""} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
              <label className="flex items-center justify-between gap-2">Morálka<Input className="w-24" type="number" value={draft.morale ?? ""} onChange={e => setDraft(d => ({ ...d, morale: e.target.value }))} /></label>
              {UNIT_TYPES.map(t => <label key={t} className="flex items-center justify-between gap-2">{UNIT_TYPE_LABELS[t]}<Input className="w-24" type="number" min={0} step={200} value={draft[t] ?? "0"} onChange={e => setDraft(d => ({ ...d, [t]: e.target.value }))} /></label>)}
              <div className="flex gap-2"><Button size="sm" onClick={saveArmy} disabled={busy}><Save className="mr-1 h-4 w-4" />Uložit</Button><Button size="sm" variant="destructive" onClick={deleteArmy} disabled={busy}><Trash2 className="mr-1 h-4 w-4" />Smazat</Button></div>
            </div>
          )}
          {city && (
            <div className="space-y-2 rounded border border-border p-2">
              <p className="font-semibold">Město · {city.owner}</p>
              <Input value={draft.name ?? ""} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
              <label className="flex items-center justify-between gap-2">Obyvatel<Input className="w-28" type="number" min={0} value={draft.population ?? ""} onChange={e => setDraft(d => ({ ...d, population: e.target.value }))} /></label>
              <Button size="sm" onClick={saveCity} disabled={busy}><Save className="mr-1 h-4 w-4" />Uložit</Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Malování mění typ makropole; mikropolíčka, cesty a suroviny živé hry zatím editor neupravuje.</p>
        </aside>
        <main className="min-w-0 flex-1 overflow-auto">
          <ScenarioMap scenario={view.scenario} deposits={deposits} selectedTile={selection?.kind === "tile" ? { x: Number(selection.id.split(",")[0]), y: Number(selection.id.split(",")[1]) } : null} roadDraft={null} selection={selection} overlayKind={null}
            onCell={(x, y, dragging) => { if (!dragging || tool === "paint") onCell(x, y); }} onStrokeStart={() => {}} onSelect={s => { if (tool === "select" || tool === "move") setSelection(s); }} />
        </main>
      </div>
    </div>
  );
}
