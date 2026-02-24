import { useState, useEffect } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { generateDeterministicCityDescription } from "@/lib/cityDescriptions";
import { updateCity } from "@/hooks/useGameSession";
import { generateCityProfile } from "@/lib/ai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, MapPin, Sparkles, BookOpen, Shield, Flame, Crown, Scroll, Landmark, Brain, Globe, Castle, Map, ImageIcon, Loader2 } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { toast } from "sonner";
import RichText from "@/components/RichText";
import { supabase } from "@/integrations/supabase/client";
import AILoreButton from "@/components/AILoreButton";
import WorldMemoryPanel from "@/components/WorldMemoryPanel";
import CityRumorsPanel from "@/components/CityRumorsPanel";
import SettlementUpgradePanel from "@/components/SettlementUpgradePanel";
import CityGovernancePanel from "@/components/city/CityGovernancePanel";
import CityBuildingsPanel from "@/components/city/CityBuildingsPanel";
import type { EntityIndex } from "@/hooks/useEntityIndex";
import { getPermissions } from "@/lib/permissions";

type City = Tables<"cities">;
type GameEvent = Tables<"game_events">;
type GamePlayer = Tables<"game_players">;
type WorldMemory = Tables<"world_memories">;
type Wonder = Tables<"wonders">;

const CITY_LEVELS = ["Osada", "Městečko", "Město", "Polis"];
const EVENT_TYPE_LABELS: Record<string, string> = {
  place_tile: "Položení dílku", found_settlement: "Založení osady", upgrade_city: "Upgrade města",
  raid: "Nájezd", repair: "Oprava území", battle: "Bitva", diplomacy: "Diplomacie",
  city_state_action: "Akce městského státu", trade: "Obchod", wonder: "Div světa",
};
const STATUSES = ["ok", "devastated", "besieged"];
const STATUS_LABELS: Record<string, string> = { ok: "V pořádku", devastated: "Zpustošeno", besieged: "Obléháno" };

interface CityDetailPanelProps {
  city: City;
  events: GameEvent[];
  allEvents: GameEvent[];
  memories: WorldMemory[];
  wonders: Wonder[];
  players: GamePlayer[];
  currentPlayerName: string;
  currentTurn: number;
  onBack: () => void;
  myRole?: string;
  onRefetch?: () => void;
  onEventClick?: (eventId: string) => void;
  onEntityClick?: (type: string, id: string) => void;
  entityIndex?: EntityIndex;
  epochStyle?: string;
}

const CityDetailPanel = ({
  city, events, memories, wonders, players,
  currentPlayerName, currentTurn, onBack, onRefetch, onEventClick,
  onEntityClick, entityIndex, epochStyle, myRole = "player",
}: CityDetailPanelProps) => {
  const perms = getPermissions(myRole);
  const isAdmin = myRole === "admin";
  const [generating, setGenerating] = useState(false);
  const [introduction, setIntroduction] = useState<string | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  const [bulletFacts, setBulletFacts] = useState<string[]>([]);
  const [flavorPrompt, setFlavorPrompt] = useState((city as any).flavor_prompt || "");
  const [editingFlavor, setEditingFlavor] = useState(false);
  const [generatingMapIcon, setGeneratingMapIcon] = useState(false);
  const [mapIconUrl, setMapIconUrl] = useState<string | null>(null);

  // World context state
  const [worldContext, setWorldContext] = useState<{
    province: any; region: any; country: any; nearbyCities: any[];
  }>({ province: null, region: null, country: null, nearbyCities: [] });
  const [realm, setRealm] = useState<any>(null);

  useEffect(() => {
    const fetchContext = async () => {
      // Fetch province
      let province = null;
      let region = null;
      let country = null;
      if (city.province_id) {
        const { data: prov } = await supabase.from("provinces").select("*").eq("id", city.province_id).maybeSingle();
        province = prov;
        if (prov?.region_id) {
          const { data: reg } = await supabase.from("regions").select("*").eq("id", prov.region_id).maybeSingle();
          region = reg;
          if ((reg as any)?.country_id) {
            const { data: cnt } = await supabase.from("countries").select("*").eq("id", (reg as any).country_id).maybeSingle();
            country = cnt;
          }
        }
      }
      // Fetch nearby cities (same session, different id, limit 3)
      const { data: nearby } = await supabase.from("cities").select("id, name, settlement_level, province")
        .eq("session_id", city.session_id).neq("id", city.id).limit(3);

      // Fetch realm resources for upgrade panel
      const { data: realmData } = await supabase.from("realm_resources").select("*")
        .eq("session_id", city.session_id).eq("player_name", city.owner_player).maybeSingle();

      setWorldContext({ province, region, country, nearbyCities: nearby || [] });
      setRealm(realmData);
    };
    fetchContext();
  }, [city.id, city.province_id, city.session_id, city.owner_player]);

  // Cached deterministic description
  const [cachedDescription, setCachedDescription] = useState<string>("");
  useEffect(() => {
    const cached = (city as any).city_description_cached;
    if (cached) {
      setCachedDescription(cached);
    } else {
      setCachedDescription(generateDeterministicCityDescription(city as any));
    }
  }, [city]);

  const isOwner = city.owner_player === currentPlayerName;
  const confirmedEvents = events.filter(e => e.confirmed);
  const approvedMemories = memories.filter(m => m.approved);

  // Group events by turn
  const eventsByTurn = confirmedEvents.reduce<Record<number, GameEvent[]>>((acc, e) => {
    (acc[e.turn_number] = acc[e.turn_number] || []).push(e);
    return acc;
  }, {});
  const sortedTurns = Object.keys(eventsByTurn).map(Number).sort((a, b) => b - a);

  const handleSaveFlavor = async () => {
    await supabase.from("cities").update({ flavor_prompt: flavorPrompt || null } as any).eq("id", city.id);
    setEditingFlavor(false);
    toast.success("Flavor prompt uložen");
    onRefetch?.();
  };

  const handleGenerate = async (type: "intro" | "history" | "both") => {
    setGenerating(true);
    try {
      // Gather city-specific memories
      const cityMems = memories
        .filter(m => m.approved && (m as any).city_id === city.id)
        .map(m => ({ text: m.text, category: (m as any).category }));
      const provMems = city.province_id
        ? memories.filter(m => m.approved && (m as any).province_id === city.province_id).map(m => ({ text: m.text, category: (m as any).category }))
        : [];

      const result = await generateCityProfile({
        name: city.name,
        ownerName: city.owner_player,
        level: city.level,
        province: city.province || "",
        tags: city.tags || [],
        foundedRound: (city as any).founded_round || 1,
        status: (city as any).status || "ok",
        ownerFlavorPrompt: (city as any).flavor_prompt || null,
      }, confirmedEvents, approvedMemories.map(m => m.text), cityMems, provMems);

      if (type === "intro" || type === "both") setIntroduction(result.introduction);
      if (type === "history" || type === "both") {
        setHistory(result.historyRetelling);
        setBulletFacts(result.bulletFacts || []);
      }
      toast.success("Profil města vygenerován");
    } catch {
      toast.error("Generování profilu selhalo");
    }
    setGenerating(false);
  };

  const handleUpdateStatus = async (newStatus: string) => {
    await supabase.from("cities").update({ status: newStatus } as any).eq("id", city.id);
    toast.success(`Status města změněn na ${STATUS_LABELS[newStatus]}`);
    onRefetch?.();
  };

  // Derived society profile
  const pop = city.population_total || 0;
  const peasantPct = pop > 0 ? (city.population_peasants || 0) / pop : 0;
  const burgherPct = pop > 0 ? (city.population_burghers || 0) / pop : 0;
  const clericPct = pop > 0 ? (city.population_clerics || 0) / pop : 0;
  const societyProfile = clericPct > 0.3 ? "Klerikální vliv" : burgherPct > 0.4 ? "Urbanizující se" : peasantPct > 0.6 ? "Agrární" : "Vyvážená";

  const SETTLEMENT_LABELS: Record<string, string> = { HAMLET: "Osada", TOWNSHIP: "Městečko", CITY: "Město", POLIS: "Polis" };

  // Fetch wiki image for hero + lazy generate if ai_description empty
  const [wikiImage, setWikiImage] = useState<string | null>(null);
  const [wikiSummary, setWikiSummary] = useState<string | null>(null);
  const [lazyGenerating, setLazyGenerating] = useState(false);
  useEffect(() => {
    const fetchWiki = async () => {
      const [{ data: wikiData }, { data: iconData }] = await Promise.all([
        supabase.from("wiki_entries").select("image_url, summary, ai_description")
          .eq("session_id", city.session_id).eq("entity_type", "city").eq("entity_id", city.id).maybeSingle(),
        supabase.from("encyclopedia_images").select("image_url")
          .eq("session_id", city.session_id).eq("entity_id", city.id).eq("entity_type", "city").eq("kind", "map_icon").limit(1),
      ]);
      if (wikiData) { setWikiImage(wikiData.image_url); setWikiSummary(wikiData.summary); }
      if (iconData && iconData.length > 0) { setMapIconUrl(iconData[0].image_url); }

      // Lazy generate: if ai_description is empty, check server_config and trigger wiki-generate
      const aiDesc = wikiData?.ai_description;
      if (!aiDesc || (typeof aiDesc === "string" && aiDesc.trim().length < 10)) {
        // Check if lazy generation is enabled
        const { data: cfgData } = await supabase
          .from("server_config" as any)
          .select("economic_params")
          .eq("session_id", city.session_id)
          .maybeSingle();
        const econ = (cfgData as any)?.economic_params || {};
        if (econ.lazy_generate_on_open !== false) {
          setLazyGenerating(true);
          try {
            const { data: genData } = await supabase.functions.invoke("wiki-generate", {
              body: {
                entityType: "city", entityName: city.name, entityId: city.id,
                sessionId: city.session_id, ownerPlayer: city.owner_player,
                context: { regionName: city.province, description: city.city_description_cached, level: city.level },
              },
            });
            if (genData?.summary) setWikiSummary(genData.summary);
            if (genData?.imageUrl) setWikiImage(genData.imageUrl);
          } catch (e) {
            console.error("Lazy wiki generation failed:", e);
          } finally {
            setLazyGenerating(false);
          }
        }
      }
    };
    fetchWiki();
  }, [city.id, city.session_id]);

  const handleGenerateMapIcon = async () => {
    setGeneratingMapIcon(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-map-icon", {
        body: { session_id: city.session_id, city_id: city.id },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      setMapIconUrl(data.map_icon_url);
      toast.success(`Mapový avatar pro ${city.name} vygenerován!`);
      onRefetch?.();
    } catch (e: any) {
      toast.error("Generování avataru selhalo: " + (e.message || "neznámá chyba"));
    } finally {
      setGeneratingMapIcon(false);
    }
  };

  return (
    <div className="space-y-6 p-4">
      {/* ─── HERO HEADER ─── */}
      <div className="relative rounded-xl overflow-hidden border border-border">
        <Button variant="ghost" size="icon" onClick={onBack} className="absolute top-3 left-3 z-10 bg-background/70 backdrop-blur-sm">
          <ArrowLeft className="h-5 w-5" />
        </Button>

        <div className="relative h-[180px] md:h-[260px]">
          {wikiImage ? (
            <img src={wikiImage} alt={city.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/10 via-muted to-primary/5 flex items-center justify-center">
              <Castle className="h-16 w-16 text-muted-foreground/20" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />

          <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6">
            {/* Breadcrumbs */}
            {(worldContext.region || worldContext.province) && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1.5">
                {worldContext.region && (
                  <button className="hover:text-primary transition-colors" onClick={() => onEntityClick?.("region", worldContext.region.id)}>
                    {worldContext.region.name}
                  </button>
                )}
                {worldContext.region && worldContext.province && <span>›</span>}
                {worldContext.province && (
                  <button className="hover:text-primary transition-colors" onClick={() => onEntityClick?.("province", worldContext.province.id)}>
                    {worldContext.province.name}
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-display font-bold">{city.name}</h1>
              <Badge variant="secondary" className="font-display">{city.level}</Badge>
              {city.tags && city.tags.map(t => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
              {(city as any).status && (city as any).status !== "ok" && (
                <Badge variant="destructive" className="flex items-center gap-1">
                  {(city as any).status === "devastated" ? <Flame className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
                  {STATUS_LABELS[(city as any).status]}
                </Badge>
              )}
            </div>

            {/* Lore sentence */}
            {wikiSummary && (
              <p className="text-sm text-muted-foreground italic max-w-md mb-2">{wikiSummary}</p>
            )}

            {/* Quick stats chips */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-background/70 backdrop-blur-sm border border-border/50 text-xs">
                <Crown className="h-3 w-3 text-primary" />
                <span>{city.owner_player}</span>
              </div>
              <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-background/70 backdrop-blur-sm border border-border/50 text-xs">
                <span>👥</span>
                <span className="font-semibold">{pop.toLocaleString()}</span>
                <InfoTip side="bottom">Celková populace: {(city.population_peasants||0).toLocaleString()} rolníků, {(city.population_burghers||0).toLocaleString()} měšťanů, {(city.population_clerics||0).toLocaleString()} kleriků. Profil: {societyProfile}.</InfoTip>
              </div>
              <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-background/70 backdrop-blur-sm border border-border/50 text-xs">
                <Shield className={`h-3 w-3 ${city.city_stability < 40 ? "text-destructive" : "text-primary"}`} />
                <span className={`font-semibold ${city.city_stability < 40 ? "text-destructive" : ""}`}>{city.city_stability}</span>
                <InfoTip side="bottom">Stabilita města. Klesá při hladomoru, válkách a vysoké mobilizaci. Pod 40 hrozí vzpoury.</InfoTip>
              </div>
              <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-background/70 backdrop-blur-sm border border-border/50 text-xs">
                <span>🌾</span>
                <span className="font-semibold">{((city as any).last_turn_grain_prod || 0) - ((city as any).last_turn_grain_cons || 0)}</span>
                <InfoTip side="bottom">Bilance obilí: produkce {(city as any).last_turn_grain_prod || 0} − spotřeba {(city as any).last_turn_grain_cons || 0}. Závisí na pracovní síle a populaci.</InfoTip>
              </div>
            </div>
          </div>
        </div>

        {/* Admin controls row */}
        {perms.canEditCityStatus && (
          <div className="flex items-center gap-2 p-3 bg-card border-t border-border">
            <span className="text-xs text-muted-foreground font-display">Admin:</span>
            <Select value={(city as any).status || "ok"} onValueChange={handleUpdateStatus}>
              <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
              </SelectContent>
            </Select>
            {isOwner && (
              <AILoreButton
                sessionId={city.session_id}
                loreType="city_lore"
                context={{ cityName: city.name, biome: city.province || "", owner: city.owner_player }}
                label="✨ AI Lore"
                compact
              />
            )}
          </div>
        )}

        {/* Map Avatar generation — visible to owner + admin */}
        {(isOwner || isAdmin) && (
          <div className="flex items-center gap-3 p-3 bg-card border-t border-border">
            {mapIconUrl && (
              <img src={mapIconUrl} alt="Map icon" className="w-10 h-10 rounded border border-border" style={{ imageRendering: "pixelated" }} />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-display font-semibold">Mapový avatar</p>
              <p className="text-[10px] text-muted-foreground">
                {mapIconUrl ? "Pixel-art ikona pro hexovou mapu" : "Vygenerujte pixel-art ikonu z ilustrace města"}
              </p>
            </div>
            <Button
              size="sm"
              variant={mapIconUrl ? "outline" : "default"}
              className="h-8 text-xs gap-1.5 font-display shrink-0"
              disabled={generatingMapIcon}
              onClick={handleGenerateMapIcon}
            >
              {generatingMapIcon ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3" />}
              {mapIconUrl ? "Přegenerovat" : "Generovat avatar"}
            </Button>
          </div>
        )}
      </div>

      {/* World Context Card */}
      {(worldContext.province || worldContext.region || worldContext.country || worldContext.nearbyCities.length > 0 || (city.tags && city.tags.length > 0)) && (
        <div className="bg-card p-4 rounded-lg border border-border space-y-2">
          <h3 className="font-display font-semibold text-sm flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            Umístění ve světě
          </h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            {worldContext.province && (
              <div className="flex items-center gap-2">
                <Castle className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">Provincie:</span>
                <button className="text-primary hover:underline text-sm font-semibold"
                  onClick={() => onEntityClick?.("province", worldContext.province.id)}>
                  {worldContext.province.name}
                </button>
              </div>
            )}
            {worldContext.region && (
              <div className="flex items-center gap-2">
                <Map className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">Region:</span>
                <button className="text-primary hover:underline text-sm font-semibold"
                  onClick={() => onEntityClick?.("region", worldContext.region.id)}>
                  {worldContext.region.name}
                </button>
              </div>
            )}
            {worldContext.country && (
              <div className="flex items-center gap-2">
                <Globe className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">Stát:</span>
                <span className="font-semibold">{worldContext.country.name}</span>
              </div>
            )}
          </div>
          {worldContext.nearbyCities.length > 0 && (
            <div className="pt-1">
              <span className="text-xs text-muted-foreground">Blízká sídla: </span>
              {worldContext.nearbyCities.map((nc, i) => (
                <span key={nc.id}>
                  <button className="text-xs text-primary hover:underline"
                    onClick={() => onEntityClick?.("city", nc.id)}>
                    {nc.name}
                  </button>
                  {i < worldContext.nearbyCities.length - 1 && <span className="text-xs text-muted-foreground">, </span>}
                </span>
              ))}
            </div>
          )}
          {city.tags && city.tags.length > 0 && (
            <div className="flex gap-1 flex-wrap pt-1">
              {city.tags.map(t => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}
            </div>
          )}
        </div>
      )}

      {/* Population & Society card */}
      <div className="bg-card p-4 rounded-lg border border-border space-y-3">
        <h3 className="font-display font-semibold text-sm flex items-center gap-2">
          <Crown className="h-4 w-4 text-primary" />
          Populace & Společnost
          <Badge variant="outline" className="text-[10px] ml-auto">{societyProfile}</Badge>
        </h3>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Celková populace</span>
          <span className="text-lg font-bold">{pop.toLocaleString()}</span>
        </div>
        <div className="flex h-2.5 rounded-full overflow-hidden bg-muted">
          <div className="bg-primary/70" style={{ width: `${Math.round(peasantPct * 100)}%` }} />
          <div className="bg-accent" style={{ width: `${Math.round(burgherPct * 100)}%` }} />
          <div className="bg-muted-foreground/40" style={{ width: `${Math.round(clericPct * 100)}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="text-center"><span className="font-semibold">{city.population_peasants || 0}</span><br /><span className="text-muted-foreground">Sedláci ({Math.round(peasantPct * 100)}%)</span></div>
          <div className="text-center"><span className="font-semibold">{city.population_burghers || 0}</span><br /><span className="text-muted-foreground">Měšťané ({Math.round(burgherPct * 100)}%)</span></div>
          <div className="text-center"><span className="font-semibold">{city.population_clerics || 0}</span><br /><span className="text-muted-foreground">Klérus ({Math.round(clericPct * 100)}%)</span></div>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span>Úroveň osídlení: <Badge variant="secondary" className="text-[10px]">{SETTLEMENT_LABELS[city.settlement_level] || city.settlement_level}</Badge></span>
          <span>Stabilita: <strong className={city.city_stability < 40 ? "text-destructive" : ""}>{city.city_stability}</strong>/100</span>
        </div>
      </div>

      {/* Economy card */}
      <div className="bg-card p-4 rounded-lg border border-border space-y-2">
        <h3 className="font-display font-semibold text-sm flex items-center gap-2">
          <Landmark className="h-4 w-4 text-primary" />
          Ekonomika města
        </h3>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="flex justify-between"><span className="text-muted-foreground">Produkce obilí</span><span className="font-semibold">{(city as any).last_turn_grain_prod || 0}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Spotřeba obilí</span><span className="font-semibold">{(city as any).last_turn_grain_cons || 0}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Lokální sýpka</span><span className="font-semibold">{city.local_grain_reserve || 0} / {city.local_granary_capacity || 0}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Zranitelnost</span><span className="font-semibold">{(city.vulnerability_score || 0).toFixed(1)}</span></div>
        </div>
      </div>

      {/* ─── CITY GOVERNANCE (Food, Labor, Districts, Factions) ─── */}
      <CityGovernancePanel
        sessionId={city.session_id}
        city={city}
        realm={realm}
        currentPlayerName={currentPlayerName}
        currentTurn={currentTurn}
        isOwner={isOwner}
        onRefetch={onRefetch}
      />

      {/* ─── CITY BUILDINGS ─── */}
      <CityBuildingsPanel
        sessionId={city.session_id}
        cityId={city.id}
        cityName={city.name}
        settlementLevel={city.settlement_level}
        realm={realm}
        currentPlayerName={currentPlayerName}
        currentTurn={currentTurn}
        isOwner={isOwner}
        onRefetch={onRefetch}
      />

      {/* Famine / Status card */}
      {city.famine_turn && (
        <div className="bg-destructive/5 border border-destructive/30 p-4 rounded-lg space-y-1">
          <h3 className="font-display font-semibold text-sm flex items-center gap-2 text-destructive">
            <Flame className="h-4 w-4" />
            Hladomor
          </h3>
          <p className="text-xs text-destructive">Deficit: {city.famine_severity} • Stabilita klesá</p>
        </div>
      )}

      {/* Level upgrade - admin can edit directly, players see upgrade panel */}
      {perms.canEditCityLevel ? (
        <div className="flex items-center gap-2">
          <span className="text-sm font-display">Úroveň:</span>
          <Select value={city.level} onValueChange={v => { updateCity(city.id, { level: v }); onRefetch?.(); }}>
            <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{CITY_LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      ) : isOwner && city.settlement_level !== "POLIS" ? (
        <SettlementUpgradePanel city={city} realm={realm} onRefetch={onRefetch} />
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-sm font-display">Úroveň:</span>
          <Badge variant="secondary" className="text-xs">{city.level}</Badge>
        </div>
      )}

      {/* Flavor prompt */}
      {isOwner && (
        <div className="bg-card p-4 rounded-lg border border-border space-y-2">
          <h3 className="font-display font-semibold text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Flavor prompt města
          </h3>
          <p className="text-xs text-muted-foreground">
            Popište atmosféru a styl města. AI ho použije pro tón narativů (nebude vymýšlet fakta).
          </p>
          {editingFlavor ? (
            <div className="space-y-2">
              <Textarea
                value={flavorPrompt}
                onChange={e => setFlavorPrompt(e.target.value)}
                placeholder="Např.: Petra má být popisována jako růžová mramorová citadela s hrdou elitou..."
                rows={3}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveFlavor}>Uložit</Button>
                <Button size="sm" variant="outline" onClick={() => setEditingFlavor(false)}>Zrušit</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <p className="text-sm italic flex-1">
                {(city as any).flavor_prompt || "Žádný flavor prompt nastaven."}
              </p>
              <Button size="sm" variant="outline" onClick={() => setEditingFlavor(true)}>Upravit</Button>
            </div>
          )}
        </div>
      )}

      {/* Cached city description */}
      {cachedDescription && (
        <div className="bg-muted/30 p-4 rounded-lg border border-border">
          <p className="text-sm leading-relaxed italic">{cachedDescription}</p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {(city as any).city_description_cached ? `Generováno v kole ${(city as any).city_description_last_turn || "?"}` : "Automatický popis"}
          </p>
        </div>
      )}

      {/* AI Generation */}
      <div className="bg-card p-4 rounded-lg border-2 border-primary/20 shadow-parchment space-y-3">
        <h3 className="font-display font-semibold text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          AI profil města
        </h3>
        {isOwner ? (
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={() => handleGenerate("intro")} disabled={generating} className="font-display">
              <BookOpen className="h-3 w-3 mr-1" />Představení města
            </Button>
            <Button size="sm" onClick={() => handleGenerate("history")} disabled={generating} className="font-display">
              <Scroll className="h-3 w-3 mr-1" />Městská sága
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleGenerate("both")} disabled={generating} className="font-display">
              {generating ? "Generuji..." : "Obojí najednou"}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">AI profil může generovat pouze majitel města.</p>
        )}

        {introduction && (
          <div className="p-4 rounded-lg border border-border bg-muted/30 space-y-2">
            <h4 className="font-display font-semibold text-sm">📜 Představení</h4>
            <RichText text={introduction} onEventClick={onEventClick} className="text-sm leading-relaxed whitespace-pre-wrap" />
          </div>
        )}

        {history && (
          <div className="p-4 rounded-lg border border-border bg-muted/30 space-y-2">
            <h4 className="font-display font-semibold text-sm">📖 Městská sága</h4>
            <RichText text={history} onEventClick={onEventClick} className="text-sm leading-relaxed whitespace-pre-wrap" />
            {bulletFacts.length > 0 && (
              <ul className="text-sm space-y-1 mt-2">
                {bulletFacts.map((f, i) => <li key={i} className="flex items-start gap-1"><span>•</span><span>{f}</span></li>)}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Wonders in city */}
      {wonders.length > 0 && (
        <div className="bg-card p-4 rounded-lg border border-border space-y-2">
          <h3 className="font-display font-semibold text-sm flex items-center gap-2">
            <Landmark className="h-4 w-4 text-primary" />
            Divy města ({wonders.length})
          </h3>
          <div className="space-y-2">
            {wonders.map(w => (
              <div key={w.id} className="p-3 rounded border border-border bg-muted/20">
                <div className="flex items-center gap-2">
                  <span className="font-display font-semibold text-sm">{w.name}</span>
                  <Badge variant="secondary" className="text-xs">{w.status}</Badge>
                  <Badge variant="outline" className="text-xs">{w.era}</Badge>
                </div>
                {w.description && <p className="text-xs text-muted-foreground mt-1">{w.description}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* City Rumors */}
      <CityRumorsPanel
        sessionId={(city as any).session_id || ""}
        cityId={city.id}
        cityName={city.name}
        ownerPlayer={city.owner_player}
        currentTurn={currentTurn}
        events={events}
        memories={memories}
        epochStyle={epochStyle}
        entityIndex={entityIndex}
        onEventClick={onEventClick}
        onEntityClick={onEntityClick}
      />

      {/* City Memory (local identity layer) */}
      <WorldMemoryPanel
        sessionId={(city as any).session_id}
        memories={memories}
        filterCityId={city.id}
      />

      {/* City Timeline */}
      <div className="bg-card p-4 rounded-lg border border-border space-y-3">
        <h3 className="font-display font-semibold text-sm flex items-center gap-2">
          <Scroll className="h-4 w-4 text-primary" />
          Historie města ({confirmedEvents.length} potvrzených událostí)
        </h3>

        {confirmedEvents.length === 0 && (
          <p className="text-xs text-muted-foreground italic py-4 text-center">
            K tomuto městu zatím nejsou přiřazeny žádné potvrzené události.
          </p>
        )}

        {sortedTurns.map(turn => (
          <div key={turn} className="space-y-1">
            <h4 className="font-display text-xs text-primary font-semibold">Rok {turn}</h4>
            {eventsByTurn[turn].map(evt => (
              <div key={evt.id} className="p-2 rounded bg-muted/30 text-sm flex items-center gap-2">
                <Badge variant="outline" className="text-xs shrink-0">
                  {EVENT_TYPE_LABELS[evt.event_type] || evt.event_type}
                </Badge>
                <span className="font-semibold text-xs">{evt.player}</span>
                {evt.note && <span className="text-xs text-muted-foreground italic truncate">— {evt.note}</span>}
              </div>
            ))}
          </div>
        ))}

        {/* Also show unconfirmed events */}
        {events.filter(e => !e.confirmed).length > 0 && (
          <div className="pt-2 border-t border-border">
            <h4 className="font-display text-xs text-muted-foreground font-semibold mb-1">Nepotvrzené</h4>
            {events.filter(e => !e.confirmed).map(evt => (
              <div key={evt.id} className="p-2 rounded bg-muted/10 text-sm flex items-center gap-2 opacity-60">
                <Badge variant="outline" className="text-xs shrink-0">
                  {EVENT_TYPE_LABELS[evt.event_type] || evt.event_type}
                </Badge>
                <span className="font-semibold text-xs">{evt.player}</span>
                {evt.note && <span className="text-xs text-muted-foreground italic truncate">— {evt.note}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CityDetailPanel;
