/**
 * @deprecated Legacy editor surface. Not part of the beta player loop.
 * Mounted only when `useDevMode` is enabled (see CitiesTab.tsx).
 * Reads/writes legacy `player_resources` / `military_capacity` / `trade_log`.
 * Do NOT extend. See docs/BETA_SCOPE.md and DEPRECATION.md.
 */
import { useState, useEffect } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { addCity, updateCity, deleteCity, updateResource, addArmy, updateArmy, addTrade } from "@/hooks/useGameSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Castle, Swords, Plus, Trash2, ArrowUpDown, HandCoins, Coins } from "lucide-react";
import { toast } from "sonner";
import { RESOURCE_ICONS, RESOURCE_LABELS } from "@/lib/economyConstants";

type City = Tables<"cities">;
type PlayerResource = Tables<"player_resources">;
type MilitaryCapacity = Tables<"military_capacity">;
type TradeLog = Tables<"trade_log">;
type GamePlayer = Tables<"game_players">;

const CITY_LEVELS = ["Osada", "Městečko", "Město", "Polis"];
const CITY_TAGS = ["port", "fortress", "holy_city", "market", "mine"];
const ARMY_TYPES = ["Lehká", "Těžká", "Obléhací", "Námořní"];
const TRADE_TYPES = ["Obchod", "Tribut", "Dar"];

interface EmpireManagementProps {
  sessionId: string;
  players: GamePlayer[];
  cities: City[];
  resources: PlayerResource[];
  armies: MilitaryCapacity[];
  trades: TradeLog[];
  currentPlayerName: string;
  currentTurn: number;
}

const EmpireManagement = ({ sessionId, players, cities, resources, armies, trades, currentPlayerName, currentTurn }: EmpireManagementProps) => {
  const playerNames = players.map(p => p.player_name);

  return (
    <div className="space-y-6 p-4">
      <h1 className="text-2xl font-display font-bold flex items-center gap-2">
        <Castle className="h-6 w-6 text-primary" />
        Správa říše
      </h1>

      <Tabs defaultValue="cities" className="w-full">
        <TabsList className="bg-card border border-border w-full justify-start flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="cities" className="font-display text-xs"><Castle className="h-3 w-3 mr-1" />Města</TabsTrigger>
          <TabsTrigger value="resources" className="font-display text-xs"><Coins className="h-3 w-3 mr-1" />Zdroje</TabsTrigger>
          <TabsTrigger value="military" className="font-display text-xs"><Swords className="h-3 w-3 mr-1" />Armáda</TabsTrigger>
          <TabsTrigger value="trade" className="font-display text-xs"><HandCoins className="h-3 w-3 mr-1" />Obchod</TabsTrigger>
        </TabsList>

        <TabsContent value="cities">
          <CitiesPanel sessionId={sessionId} cities={cities} playerNames={playerNames} currentPlayerName={currentPlayerName} />
        </TabsContent>
        <TabsContent value="resources">
          <ResourcesPanel resources={resources} playerNames={playerNames} currentPlayerName={currentPlayerName} />
        </TabsContent>
        <TabsContent value="military">
          <MilitaryPanel sessionId={sessionId} armies={armies} resources={resources} playerNames={playerNames} currentPlayerName={currentPlayerName} />
        </TabsContent>
        <TabsContent value="trade">
          <TradePanel sessionId={sessionId} trades={trades} playerNames={playerNames} currentPlayerName={currentPlayerName} currentTurn={currentTurn} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

// ---- Cities Sub-Panel ----
function CitiesPanel({ sessionId, cities, playerNames, currentPlayerName }: { sessionId: string; cities: City[]; playerNames: string[]; currentPlayerName: string }) {
  const [name, setName] = useState("");
  const [province, setProvince] = useState("");
  const [level, setLevel] = useState("Osada");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const handleAdd = async () => {
    if (!name.trim()) { toast.error("Zadejte název města"); return; }
    await addCity(sessionId, currentPlayerName, name.trim(), province.trim(), level, selectedTags);
    setName(""); setProvince(""); setLevel("Osada"); setSelectedTags([]);
    toast.success("Město založeno");
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const groupedByPlayer = playerNames.map(pn => ({
    player: pn,
    cities: cities.filter(c => c.owner_player === pn),
  }));

  return (
    <div className="space-y-4 mt-4">
      {/* Add city form */}
      <div className="bg-card p-4 rounded-lg border border-border space-y-3">
        <h3 className="font-display font-semibold text-sm">Založit nové město</h3>
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Název města" value={name} onChange={e => setName(e.target.value)} className="h-9" />
          <Input placeholder="Provincie (volitelné)" value={province} onChange={e => setProvince(e.target.value)} className="h-9" />
        </div>
        <div className="flex gap-2 items-center">
          <Select value={level} onValueChange={setLevel}>
            <SelectTrigger className="w-32 h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CITY_LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex gap-1 flex-wrap flex-1">
            {CITY_TAGS.map(tag => (
              <Badge
                key={tag}
                variant={selectedTags.includes(tag) ? "default" : "outline"}
                className="cursor-pointer text-xs"
                onClick={() => toggleTag(tag)}
              >{tag}</Badge>
            ))}
          </div>
        </div>
        <Button onClick={handleAdd} size="sm" className="font-display"><Plus className="h-3 w-3 mr-1" />Založit</Button>
      </div>

      {/* Cities list by player */}
      {groupedByPlayer.map(group => (
        <div key={group.player} className="space-y-2">
          <h3 className="font-display font-semibold text-sm text-primary">{group.player}</h3>
          {group.cities.length === 0 && <p className="text-xs text-muted-foreground italic">Žádná města</p>}
          <div className="grid gap-2 md:grid-cols-2">
            {group.cities.map(city => (
              <div key={city.id} className="p-3 rounded-lg border border-border bg-card shadow-parchment">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-display font-semibold">{city.name}</span>
                    <Badge variant="secondary" className="ml-2 text-xs">{city.level}</Badge>
                  </div>
                  {city.owner_player === currentPlayerName && (
                    <div className="flex gap-1">
                      <Select value={city.level} onValueChange={v => updateCity(city.id, { level: v })}>
                        <SelectTrigger className="w-24 h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{CITY_LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                      </Select>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteCity(city.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
                {city.province && <p className="text-xs text-muted-foreground mt-1">📍 {city.province}</p>}
                {city.tags && city.tags.length > 0 && (
                  <div className="flex gap-1 mt-1">{city.tags.map(t => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- Resources Sub-Panel ----
function ResourcesPanel({ resources, playerNames, currentPlayerName }: { resources: PlayerResource[]; playerNames: string[]; currentPlayerName: string }) {
  const handleUpdate = async (id: string, field: "income" | "upkeep" | "stockpile", delta: number) => {
    const res = resources.find(r => r.id === id);
    if (!res) return;
    const newVal = Math.max(0, res[field] + delta);
    await updateResource(id, { [field]: newVal });
  };

  return (
    <div className="space-y-4 mt-4">
      {playerNames.map(pn => {
        const playerRes = resources.filter(r => r.player_name === pn);
        return (
          <div key={pn} className="bg-card p-4 rounded-lg border border-border shadow-parchment">
            <h3 className="font-display font-semibold mb-3 text-primary">{pn}</h3>
            <div className="space-y-2">
              {playerRes.map(r => {
                const surplus = r.income - r.upkeep;
                const isOwner = pn === currentPlayerName;
                return (
                  <div key={r.id} className="flex items-center gap-2 text-sm">
                    {RESOURCE_ICONS[r.resource_type]}
                    <span className="w-16 font-semibold">{RESOURCE_LABELS[r.resource_type] || r.resource_type}</span>
                    <div className="flex items-center gap-1">
                      {isOwner && <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => handleUpdate(r.id, "income", -1)}>-</Button>}
                      <span className="text-xs w-6 text-center text-green-600">+{r.income}</span>
                      {isOwner && <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => handleUpdate(r.id, "income", 1)}>+</Button>}
                    </div>
                    <span className="text-xs text-muted-foreground">/</span>
                    <div className="flex items-center gap-1">
                      {isOwner && <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => handleUpdate(r.id, "upkeep", -1)}>-</Button>}
                      <span className="text-xs w-6 text-center text-red-600">-{r.upkeep}</span>
                      {isOwner && <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => handleUpdate(r.id, "upkeep", 1)}>+</Button>}
                    </div>
                    <span className="text-xs text-muted-foreground">=</span>
                    <span className={`text-xs font-bold ${surplus >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {surplus >= 0 ? `+${surplus}` : surplus}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">📦 {r.stockpile}</span>
                    {isOwner && (
                      <div className="flex gap-0.5">
                        <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => handleUpdate(r.id, "stockpile", -1)}>-</Button>
                        <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => handleUpdate(r.id, "stockpile", 1)}>+</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- Military Sub-Panel (new military_stacks system) ----
function MilitaryPanel({ sessionId, armies, resources, playerNames, currentPlayerName }: { sessionId: string; armies: MilitaryCapacity[]; resources: PlayerResource[]; playerNames: string[]; currentPlayerName: string }) {
  const [stacks, setStacks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await import("@/integrations/supabase/client").then(m => 
        m.supabase.from("military_stacks")
          .select("id, name, player_name, power, morale, is_active, is_deployed, unit_type, manpower")
          .eq("session_id", sessionId)
      );
      setStacks(data || []);
      setLoading(false);
    };
    load();
  }, [sessionId]);

  if (loading) return <div className="text-sm text-muted-foreground p-4">Načítám...</div>;

  return (
    <div className="space-y-4 mt-4">
      {playerNames.map(pn => {
        const playerStacks = stacks.filter(s => s.player_name === pn);
        const activeStacks = playerStacks.filter(s => s.is_active);
        const totalPower = activeStacks.reduce((s, a) => s + (a.power || 0), 0);
        const totalManpower = activeStacks.reduce((s, a) => s + (a.manpower || 0), 0);

        return (
          <div key={pn} className="bg-card p-4 rounded-lg border border-border shadow-parchment">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display font-semibold text-primary">{pn}</h3>
              <div className="flex gap-2">
                <Badge variant="outline" className="text-xs">⚔️ Síla: {totalPower}</Badge>
                <Badge variant="outline" className="text-xs">👥 Muži: {totalManpower}</Badge>
              </div>
            </div>
            {playerStacks.length === 0 && <p className="text-xs text-muted-foreground italic">Žádné jednotky</p>}
            <div className="space-y-1">
              {playerStacks.map(s => (
                <div key={s.id} className="flex items-center gap-2 text-sm p-2 rounded bg-muted/30">
                  <Swords className="h-3 w-3" />
                  <span className="font-semibold flex-1">{s.name}</span>
                  <Badge variant="secondary" className="text-xs">{s.unit_type || "MILITIA"}</Badge>
                  <span className="text-xs text-muted-foreground">⚔{s.power} 💪{s.morale}</span>
                  <Badge variant={s.is_active ? "default" : "outline"} className="text-xs">
                    {s.is_active ? (s.is_deployed ? "Nasazena" : "Aktivní") : "Neaktivní"}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- Trade Sub-Panel ----
function TradePanel({ sessionId, trades, playerNames, currentPlayerName, currentTurn }: { sessionId: string; trades: TradeLog[]; playerNames: string[]; currentPlayerName: string; currentTurn: number }) {
  const [toPlayer, setToPlayer] = useState("");
  const [resourceType, setResourceType] = useState("wealth");
  const [amount, setAmount] = useState(1);
  const [tradeType, setTradeType] = useState("Obchod");
  const [note, setNote] = useState("");

  const handleAdd = async () => {
    if (!toPlayer) { toast.error("Vyberte příjemce"); return; }
    await addTrade(sessionId, currentTurn, currentPlayerName, toPlayer, resourceType, amount, tradeType, note);
    setNote(""); setAmount(1);
    toast.success("Obchod zaznamenán");
  };

  const otherPlayers = playerNames.filter(p => p !== currentPlayerName);

  return (
    <div className="space-y-4 mt-4">
      <div className="bg-card p-4 rounded-lg border border-border space-y-3">
        <h3 className="font-display font-semibold text-sm">Nový obchod / tribut</h3>
        <div className="grid grid-cols-2 gap-2">
          <Select value={toPlayer} onValueChange={setToPlayer}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Příjemce..." /></SelectTrigger>
            <SelectContent>
              {otherPlayers.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              <SelectItem value="NPC">NPC</SelectItem>
            </SelectContent>
          </Select>
          <Select value={resourceType} onValueChange={setResourceType}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(RESOURCE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Input type="number" min={1} value={amount} onChange={e => setAmount(parseInt(e.target.value) || 1)} className="h-9 w-20" />
          <Select value={tradeType} onValueChange={setTradeType}>
            <SelectTrigger className="h-9 w-28 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{TRADE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
          <Input placeholder="Poznámka (volitelné)" value={note} onChange={e => setNote(e.target.value)} className="h-9 flex-1" />
        </div>
        <Button onClick={handleAdd} size="sm" className="font-display"><ArrowUpDown className="h-3 w-3 mr-1" />Zaznamenat</Button>
      </div>

      {/* Trade history */}
      <div className="space-y-2">
        <h3 className="font-display font-semibold text-sm">Historie obchodů</h3>
        {trades.length === 0 && <p className="text-xs text-muted-foreground italic">Žádné obchody</p>}
        {[...trades].reverse().slice(0, 20).map(t => (
          <div key={t.id} className="p-2 rounded border border-border bg-card text-sm flex items-center gap-2">
            <Badge variant="outline" className="text-xs">{t.trade_type}</Badge>
            <span>{t.from_player} → {t.to_player}</span>
            <span className="font-semibold">{t.amount}× {RESOURCE_LABELS[t.resource_type] || t.resource_type}</span>
            {t.note && <span className="text-xs text-muted-foreground italic">({t.note})</span>}
            <span className="text-xs text-muted-foreground ml-auto">Rok {t.turn_number}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default EmpireManagement;
