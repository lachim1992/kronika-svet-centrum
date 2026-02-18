import { useState } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { addCity, updateCity, deleteCity } from "@/hooks/useGameSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Building2, Plus, Search, MapPin, Shield, Flame, Eye } from "lucide-react";
import { toast } from "sonner";
import CityDetailPanel from "@/components/CityDetailPanel";

type City = Tables<"cities">;
type GameEvent = Tables<"game_events">;
type GamePlayer = Tables<"game_players">;
type WorldMemory = Tables<"world_memories">;
type Wonder = Tables<"wonders">;

const CITY_LEVELS = ["Osada", "Městečko", "Město", "Polis"];
const CITY_TAGS = ["přístav", "pevnost", "svaté město", "obchodní uzel", "hornické město"];
const STATUS_ICONS: Record<string, React.ReactNode> = {
  ok: null,
  devastated: <Flame className="h-3 w-3 text-destructive" />,
  besieged: <Shield className="h-3 w-3 text-yellow-500" />,
};
const STATUS_LABELS: Record<string, string> = {
  ok: "V pořádku",
  devastated: "Zpustošeno",
  besieged: "Obléháno",
};

interface CityDirectoryProps {
  sessionId: string;
  cities: City[];
  events: GameEvent[];
  players: GamePlayer[];
  memories: WorldMemory[];
  wonders: Wonder[];
  currentPlayerName: string;
  currentTurn: number;
  onRefetch?: () => void;
}

const CityDirectory = ({
  sessionId, cities, events, players, memories, wonders,
  currentPlayerName, currentTurn, onRefetch,
}: CityDirectoryProps) => {
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [search, setSearch] = useState("");
  const [filterOwner, setFilterOwner] = useState("__all__");
  const [filterLevel, setFilterLevel] = useState("__all__");
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [name, setName] = useState("");
  const [province, setProvince] = useState("");
  const [level, setLevel] = useState("Osada");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const playerNames = players.map(p => p.player_name);

  const handleAdd = async () => {
    if (!name.trim()) { toast.error("Zadejte název města"); return; }
    if (cities.some(c => c.name.toLowerCase() === name.trim().toLowerCase())) {
      toast.error("Město s tímto názvem již existuje"); return;
    }
    await addCity(sessionId, currentPlayerName, name.trim(), province.trim(), level, selectedTags, currentTurn);
    setName(""); setProvince(""); setLevel("Osada"); setSelectedTags([]);
    setShowCreate(false);
    toast.success("🏗️ Město založeno! Záznam vytvořen v kronice a feedu.");
    onRefetch?.();
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const filtered = cities.filter(c => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.province?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterOwner !== "__all__" && c.owner_player !== filterOwner) return false;
    if (filterLevel !== "__all__" && c.level !== filterLevel) return false;
    return true;
  });

  if (selectedCity) {
    const cityEvents = events.filter(e => e.city_id === selectedCity.id || e.secondary_city_id === selectedCity.id);
    const cityWonders = wonders.filter(w => w.city_name === selectedCity.name);
    return (
      <CityDetailPanel
        city={selectedCity}
        events={cityEvents}
        allEvents={events}
        memories={memories}
        wonders={cityWonders}
        players={players}
        currentPlayerName={currentPlayerName}
        currentTurn={currentTurn}
        onBack={() => setSelectedCity(null)}
        onRefetch={onRefetch}
      />
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold flex items-center gap-2">
          <Building2 className="h-6 w-6 text-primary" />
          Města a osady
        </h1>
        <Button onClick={() => setShowCreate(!showCreate)} size="sm" className="font-display">
          <Plus className="h-3 w-3 mr-1" />{showCreate ? "Zavřít" : "Založit město"}
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-card p-4 rounded-lg border-2 border-primary/30 shadow-parchment space-y-3">
          <h3 className="font-display font-semibold text-sm">Založit nové město</h3>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Název města" value={name} onChange={e => setName(e.target.value)} className="h-9" />
            <Input placeholder="Provincie (volitelné)" value={province} onChange={e => setProvince(e.target.value)} className="h-9" />
          </div>
          <div className="flex gap-2 items-center flex-wrap">
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
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Hledat město nebo provincii..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-9 pl-8"
          />
        </div>
        <Select value={filterOwner} onValueChange={setFilterOwner}>
          <SelectTrigger className="w-36 h-9 text-xs"><SelectValue placeholder="Vlastník..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Všichni hráči</SelectItem>
            {playerNames.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterLevel} onValueChange={setFilterLevel}>
          <SelectTrigger className="w-28 h-9 text-xs"><SelectValue placeholder="Úroveň..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Všechny</SelectItem>
            {CITY_LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* City list */}
      {filtered.length === 0 && (
        <div className="text-center py-8">
          <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className="text-muted-foreground italic">
            {cities.length === 0 ? "Zatím nebyla založena žádná města. Založte první město!" : "Žádná města neodpovídají filtru."}
          </p>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map(city => {
          const cityEventCount = events.filter(e => e.city_id === city.id).length;
          const cityWonderCount = wonders.filter(w => w.city_name === city.name).length;
          return (
            <div
              key={city.id}
              className="p-4 rounded-lg border border-border bg-card shadow-parchment hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => setSelectedCity(city)}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-display font-semibold text-base flex items-center gap-1.5">
                    {city.name}
                    {STATUS_ICONS[(city as any).status || "ok"]}
                  </h3>
                  <p className="text-xs text-muted-foreground">{city.owner_player}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant="secondary" className="text-xs">{city.level}</Badge>
                  {(city as any).status && (city as any).status !== "ok" && (
                    <Badge variant="destructive" className="text-xs">{STATUS_LABELS[(city as any).status]}</Badge>
                  )}
                </div>
              </div>
              {city.province && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  <MapPin className="h-3 w-3" />{city.province}
                </p>
              )}
              {city.tags && city.tags.length > 0 && (
                <div className="flex gap-1 mb-2 flex-wrap">
                  {city.tags.map(t => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}
                </div>
              )}
              <div className="flex items-center justify-between text-xs text-muted-foreground mt-2 pt-2 border-t border-border">
                <span>📜 {cityEventCount} událostí</span>
                {cityWonderCount > 0 && <span>🏛️ {cityWonderCount} divů</span>}
                <Button size="sm" variant="ghost" className="h-6 text-xs gap-1" onClick={e => { e.stopPropagation(); setSelectedCity(city); }}>
                  <Eye className="h-3 w-3" />Profil
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CityDirectory;
