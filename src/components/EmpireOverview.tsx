import type { Tables } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import {
  Crown, Castle, Wheat, Trees, Mountain, Gem, Coins,
  Swords, Landmark, AlertTriangle, Shield, Flame, MapPin, Scroll, BookOpen
} from "lucide-react";

type GamePlayer = Tables<"game_players">;
type City = Tables<"cities">;
type PlayerResource = Tables<"player_resources">;
type MilitaryCapacity = Tables<"military_capacity">;
type Wonder = Tables<"wonders">;
type GameEvent = Tables<"game_events">;
type ChronicleEntry = Tables<"chronicle_entries">;

const RESOURCE_ICONS: Record<string, React.ReactNode> = {
  food: <Wheat className="h-4 w-4" />,
  wood: <Trees className="h-4 w-4" />,
  stone: <Mountain className="h-4 w-4" />,
  iron: <Gem className="h-4 w-4" />,
  wealth: <Coins className="h-4 w-4" />,
};
const RESOURCE_LABELS: Record<string, string> = {
  food: "Jídlo", wood: "Dřevo", stone: "Kámen", iron: "Železo", wealth: "Zlato",
};
const LEVEL_ORDER = ["Polis", "Město", "Městečko", "Osada"];

interface EmpireOverviewProps {
  players: GamePlayer[];
  cities: City[];
  resources: PlayerResource[];
  armies: MilitaryCapacity[];
  wonders: Wonder[];
  events: GameEvent[];
  currentPlayerName: string;
  currentTurn: number;
  chronicles?: ChronicleEntry[];
}

const EmpireOverview = ({
  players, cities, resources, armies, wonders, events,
  currentPlayerName, currentTurn, chronicles = [],
}: EmpireOverviewProps) => {
  const myCities = cities.filter(c => c.owner_player === currentPlayerName);
  const myResources = resources.filter(r => r.player_name === currentPlayerName);
  const myArmies = armies.filter(a => a.player_name === currentPlayerName);
  const myWonders = wonders.filter(w => w.owner_player === currentPlayerName);
  const activeArmies = myArmies.filter(a => a.status === "Aktivní");
  const completedWonders = myWonders.filter(w => w.status === "completed");

  // Group cities by level
  const cityByLevel = LEVEL_ORDER.map(level => ({
    level,
    count: myCities.filter(c => c.level === level).length,
  })).filter(g => g.count > 0);

  // Provinces
  const provinces = [...new Set(myCities.map(c => c.province).filter(Boolean))];

  // Threats
  const devastatedCities = myCities.filter(c => c.status === "devastated" || c.status === "besieged");
  const recentThreats = events.filter(
    e => e.turn_number === currentTurn &&
      (e.event_type === "raid" || e.event_type === "battle") &&
      myCities.some(c => c.id === e.city_id || c.id === e.secondary_city_id)
  );

  // Recent news (last turn events)
  const recentEvents = events
    .filter(e => e.turn_number >= currentTurn - 1 && e.confirmed)
    .slice(-8);

  return (
    <div className="space-y-6 p-4">
      {/* Imperial Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-decorative font-bold flex items-center justify-center gap-3">
          <Crown className="h-8 w-8 text-illuminated" />
          Přehled říše
        </h1>
        <p className="text-sm text-muted-foreground font-display">
          {currentPlayerName} • Rok {currentTurn}
        </p>
      </div>

      {/* Latest Chronicle Entry */}
      {chronicles.length > 0 && (
        <div className="manuscript-card p-4 border-l-4 border-l-primary">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <h3 className="font-display font-semibold text-sm">📜 Poslední zápis v kronice</h3>
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap line-clamp-6">
            {chronicles[chronicles.length - 1].text}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            {new Date(chronicles[chronicles.length - 1].created_at).toLocaleString("cs-CZ")}
          </p>
        </div>
      )}

      <div className="scroll-divider"><span>⚜</span></div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Cities */}
        <div className="manuscript-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Castle className="h-5 w-5 text-illuminated" />
            <h3 className="font-display font-semibold text-sm">Města ({myCities.length})</h3>
          </div>
          <div className="space-y-1">
            {cityByLevel.map(g => (
              <div key={g.level} className="flex justify-between text-sm">
                <span>{g.level}</span>
                <Badge variant="secondary" className="text-xs">{g.count}</Badge>
              </div>
            ))}
            {myCities.length === 0 && (
              <p className="text-xs text-muted-foreground italic">Žádná města</p>
            )}
          </div>
        </div>

        {/* Resources */}
        <div className="manuscript-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Coins className="h-5 w-5 text-illuminated" />
            <h3 className="font-display font-semibold text-sm">Zdroje</h3>
          </div>
          <div className="space-y-1.5">
            {myResources.map(r => {
              const surplus = r.income - r.upkeep;
              return (
                <div key={r.id} className="flex items-center gap-2 text-sm">
                  {RESOURCE_ICONS[r.resource_type]}
                  <span className="flex-1 text-xs">{RESOURCE_LABELS[r.resource_type]}</span>
                  <span className={`text-xs font-bold ${surplus >= 0 ? "text-forest-green" : "text-seal-red"}`}>
                    {surplus >= 0 ? `+${surplus}` : surplus}
                  </span>
                  <span className="text-xs text-muted-foreground">📦{r.stockpile}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Military */}
        <div className="manuscript-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Swords className="h-5 w-5 text-illuminated" />
            <h3 className="font-display font-semibold text-sm">Armáda</h3>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>Aktivní legie</span>
              <Badge variant="secondary" className="text-xs">{activeArmies.length}</Badge>
            </div>
            <div className="flex justify-between text-sm">
              <span>Celkem jednotek</span>
              <Badge variant="outline" className="text-xs">{myArmies.length}</Badge>
            </div>
          </div>
        </div>

        {/* Wonders */}
        <div className="manuscript-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Landmark className="h-5 w-5 text-illuminated" />
            <h3 className="font-display font-semibold text-sm">Divy světa</h3>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>Dokončené</span>
              <Badge variant="secondary" className="text-xs">{completedWonders.length}</Badge>
            </div>
            <div className="flex justify-between text-sm">
              <span>V budování</span>
              <Badge variant="outline" className="text-xs">
                {myWonders.filter(w => w.status === "building" || w.status === "planned").length}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Provinces */}
      {provinces.length > 0 && (
        <div className="manuscript-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="h-5 w-5 text-illuminated" />
            <h3 className="font-display font-semibold text-sm">Provincie ({provinces.length})</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {provinces.map(p => {
              const provCities = myCities.filter(c => c.province === p);
              return (
                <div key={p} className="seal-badge">
                  <MapPin className="h-3 w-3" />
                  {p} ({provCities.length})
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Threats */}
      {(devastatedCities.length > 0 || recentThreats.length > 0) && (
        <div className="manuscript-card p-4" style={{ borderTopColor: 'hsl(var(--destructive) / 0.5)', borderTopWidth: '3px' }}>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <h3 className="font-display font-semibold text-sm text-destructive">Hrozby a varování</h3>
          </div>
          <div className="space-y-2">
            {devastatedCities.map(c => (
              <div key={c.id} className="flex items-center gap-2 text-sm">
                {c.status === "devastated" ? <Flame className="h-4 w-4 text-destructive" /> : <Shield className="h-4 w-4 text-yellow-600" />}
                <span className="font-semibold">{c.name}</span>
                <span className="text-xs text-muted-foreground">
                  {c.status === "devastated" ? "Zpustošeno" : "Obléháno"}
                </span>
              </div>
            ))}
            {recentThreats.map(e => (
              <div key={e.id} className="flex items-center gap-2 text-sm">
                <Swords className="h-4 w-4 text-destructive" />
                <span className="text-xs">{e.note || `${e.event_type} v ${e.location || "neznámém místě"}`}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages / Recent Events */}
      <div className="manuscript-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Scroll className="h-5 w-5 text-illuminated" />
          <h3 className="font-display font-semibold text-sm">📨 Zprávy a události dne</h3>
        </div>
        {recentEvents.length === 0 ? (
          <p className="text-xs text-muted-foreground italic text-center py-3">
            Žádné nedávné události.
          </p>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {[...recentEvents].reverse().map(e => (
              <div key={e.id} className="p-2 rounded bg-muted/30 text-sm flex items-start gap-2">
                <Badge variant="outline" className="text-xs shrink-0 mt-0.5">{e.event_type}</Badge>
                <div className="flex-1 min-w-0">
                  <span className="font-semibold">{e.player}</span>
                  {e.note && <span className="text-muted-foreground"> — {e.note}</span>}
                  {e.location && <span className="text-xs text-muted-foreground block">📍 {e.location}</span>}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">Rok {e.turn_number}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default EmpireOverview;
