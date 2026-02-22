import { useState, useEffect, useCallback } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { addCity } from "@/hooks/useGameSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Building2, Plus, Search, MapPin, Shield, Flame, Eye, ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import CityDetailPanel from "@/components/CityDetailPanel";
import { getPermissions } from "@/lib/permissions";
import { supabase } from "@/integrations/supabase/client";

type City = Tables<"cities">;
type GameEvent = Tables<"game_events">;
type GamePlayer = Tables<"game_players">;
type WorldMemory = Tables<"world_memories">;
type Wonder = Tables<"wonders">;

interface WikiInfo {
  image_url: string | null;
  summary: string | null;
}

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
  myRole?: string;
  onRefetch?: () => void;
  onCityClick?: (cityId: string) => void;
}

const CityDirectory = ({
  sessionId, cities, events, players, memories, wonders,
  currentPlayerName, currentTurn, myRole = "player", onRefetch, onCityClick,
}: CityDirectoryProps) => {
  const perms = getPermissions(myRole);
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

  // Wiki data keyed by entity_id
  const [wikiMap, setWikiMap] = useState<Record<string, WikiInfo>>({});
  const [generatingImages, setGeneratingImages] = useState<Set<string>>(new Set());

  const playerNames = players.map(p => p.player_name);

  // Fetch wiki_entries for all cities in this session
  useEffect(() => {
    if (!sessionId || cities.length === 0) return;
    const fetchWiki = async () => {
      const { data } = await supabase
        .from("wiki_entries")
        .select("entity_id, image_url, summary")
        .eq("session_id", sessionId)
        .eq("entity_type", "city")
        .in("entity_id", cities.map(c => c.id));
      if (data) {
        const map: Record<string, WikiInfo> = {};
        for (const w of data) {
          map[w.entity_id] = { image_url: w.image_url, summary: w.summary };
        }
        setWikiMap(map);
      }
    };
    fetchWiki();
  }, [sessionId, cities]);

  // Lazy generate image for a single city
  const lazyGenerateImage = useCallback(async (city: City) => {
    if (generatingImages.has(city.id)) return;
    setGeneratingImages(prev => new Set(prev).add(city.id));
    try {
      const { data } = await supabase.functions.invoke("generate-entity-media", {
        body: {
          sessionId,
          entityId: city.id,
          entityType: "city",
          entityName: city.name,
          kind: "cover",
          imagePrompt: [city.flavor_prompt, city.name, city.province, ...(city.tags || [])].filter(Boolean).join(", "),
          createdBy: "lazy_hydrate",
        },
      });
      if (data?.imageUrl) {
        setWikiMap(prev => ({
          ...prev,
          [city.id]: { ...prev[city.id], image_url: data.imageUrl },
        }));
        // Also write back to wiki_entries
        await supabase
          .from("wiki_entries")
          .update({ image_url: data.imageUrl, image_prompt: data.imagePrompt } as any)
          .eq("session_id", sessionId)
          .eq("entity_type", "city")
          .eq("entity_id", city.id);
      }
    } catch (e) {
      console.error("Lazy image gen failed for", city.name, e);
    } finally {
      setGeneratingImages(prev => {
        const next = new Set(prev);
        next.delete(city.id);
        return next;
      });
    }
  }, [sessionId, generatingImages]);

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
    if (onCityClick) {
      onCityClick(selectedCity.id);
      setSelectedCity(null);
      return null;
    }
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
        {perms.canCreateCityGlobal && (
          <p className="text-xs text-muted-foreground italic">Použijte tlačítko + pro založení města.</p>
        )}
      </div>


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
          const wiki = wikiMap[city.id];
          const cityImage = wiki?.image_url || null;
          const citySummary = wiki?.summary || null;
          const cityEventCount = events.filter(e => e.city_id === city.id).length;
          const cityWonderCount = wonders.filter(w => w.city_name === city.name).length;
          const pop = city.population_total || 0;
          const peasantPct = pop > 0 ? Math.round((city.population_peasants || 0) / pop * 100) : 0;
          const burgherPct = pop > 0 ? Math.round((city.population_burghers || 0) / pop * 100) : 0;
          const clericPct = pop > 0 ? Math.round((city.population_clerics || 0) / pop * 100) : 0;
          const SETTLEMENT_LABELS: Record<string, string> = { HAMLET: "Osada", TOWNSHIP: "Městečko", CITY: "Město", POLIS: "Polis" };
          const isGenerating = generatingImages.has(city.id);

          return (
            <div
              key={city.id}
              className={`rounded-lg border bg-card shadow-parchment hover:border-primary/50 transition-colors cursor-pointer overflow-hidden ${city.famine_turn ? "border-destructive/50" : "border-border"}`}
              onClick={() => setSelectedCity(city)}
            >
              {/* City image / placeholder */}
              <div className="relative h-28 w-full bg-muted">
                {cityImage ? (
                  <img src={cityImage} alt={city.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-primary/10 via-muted to-primary/5 flex items-center justify-center">
                    {isGenerating ? (
                      <Loader2 className="h-8 w-8 text-muted-foreground/30 animate-spin" />
                    ) : (
                      <Building2 className="h-8 w-8 text-muted-foreground/20" />
                    )}
                  </div>
                )}
                {/* Lazy generate button — only show when no image and not generating */}
                {!cityImage && !isGenerating && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="absolute bottom-1 right-1 h-6 text-[10px] gap-1 opacity-80 hover:opacity-100"
                    onClick={e => { e.stopPropagation(); lazyGenerateImage(city); }}
                  >
                    <ImageIcon className="h-3 w-3" />Generovat
                  </Button>
                )}
              </div>

              <div className="p-4">
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <h3 className="font-display font-semibold text-base flex items-center gap-1.5">
                      {city.name}
                      {STATUS_ICONS[(city as any).status || "ok"]}
                      {city.famine_turn && <Flame className="h-3 w-3 text-destructive" />}
                    </h3>
                    <p className="text-xs text-muted-foreground">{city.owner_player}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="secondary" className="text-[10px]">{SETTLEMENT_LABELS[city.settlement_level] || city.level}</Badge>
                    {(city as any).status && (city as any).status !== "ok" && (
                      <Badge variant="destructive" className="text-[10px]">{STATUS_LABELS[(city as any).status]}</Badge>
                    )}
                  </div>
                </div>

                {/* Wiki summary */}
                {citySummary && (
                  <p className="text-xs text-muted-foreground italic line-clamp-2 mb-2">{citySummary}</p>
                )}

                {/* Population total + layers mini bar */}
                <div className="mb-2">
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className="text-muted-foreground">Populace</span>
                    <span className="font-semibold">{pop.toLocaleString()}</span>
                  </div>
                  <div className="flex h-1.5 rounded-full overflow-hidden bg-muted">
                    <div className="bg-primary/70" style={{ width: `${peasantPct}%` }} title={`Sedláci ${peasantPct}%`} />
                    <div className="bg-accent" style={{ width: `${burgherPct}%` }} title={`Měšťané ${burgherPct}%`} />
                    <div className="bg-muted-foreground/40" style={{ width: `${clericPct}%` }} title={`Klérus ${clericPct}%`} />
                  </div>
                </div>

                {/* Stability + granary */}
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground mb-1">
                  <span>Stabilita: <strong className={city.city_stability < 40 ? "text-destructive" : ""}>{city.city_stability || 70}</strong></span>
                  <span>Sýpka: <strong>{city.local_grain_reserve || 0}/{city.local_granary_capacity || 0}</strong></span>
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
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CityDirectory;
