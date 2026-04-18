import type { Tables } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import {
  Crown, Castle, Coins,
  Swords, Landmark, AlertTriangle, Shield, Flame, MapPin, Scroll, BookOpen,
  Users, HeartPulse, Wheat, TreePine, Mountain, Hammer, Leaf, Hand,
} from "lucide-react";
import { adaptRealmResourceToRows, adaptMilitaryStacks } from "@/lib/empireOverviewAdapter";

type City = Tables<"cities">;
type Wonder = Tables<"wonders">;
type GameEvent = Tables<"game_events">;
type ChronicleEntry = Tables<"chronicle_entries">;
type RealmResource = Tables<"realm_resources">;
type MilitaryStack = Tables<"military_stacks">;
type GamePlayer = Tables<"game_players">;

const LEVEL_ORDER = ["Polis", "Město", "Městečko", "Osada"];

// Local label/icon map covering the canonical reserve set (incl. wood/stone/
// iron/horses/labor which are absent from the legacy economy constants).
const RES_META: Record<string, { label: string; icon: React.ReactNode }> = {
  food:   { label: "Obilí",      icon: <Wheat    className="h-4 w-4" /> },
  gold:   { label: "Zlato",      icon: <Coins    className="h-4 w-4" /> },
  wood:   { label: "Dřevo",      icon: <TreePine className="h-4 w-4" /> },
  stone:  { label: "Kámen",      icon: <Mountain className="h-4 w-4" /> },
  iron:   { label: "Železo",     icon: <Hammer   className="h-4 w-4" /> },
  horses: { label: "Koně",       icon: <Leaf     className="h-4 w-4" /> },
  labor:  { label: "Pracovní s.", icon: <Hand    className="h-4 w-4" /> },
};

interface EmpireOverviewProps {
  players: GamePlayer[];
  cities: City[];
  /** Canonical realm row for the current player. `null` = realm not initialised. */
  realmResource: RealmResource | null;
  /** Canonical stacks (full session); we filter by player inside. */
  militaryStacks: MilitaryStack[];
  wonders: Wonder[];
  events: GameEvent[];
  currentPlayerName: string;
  currentTurn: number;
  chronicles?: ChronicleEntry[];
}

/** Format a possibly-undefined number. `undefined` → "—" (truth over polish). */
function fmtSigned(v: number | undefined): string {
  if (v === undefined) return "—";
  return v >= 0 ? `+${v}` : `${v}`;
}
function fmtPlain(v: number | undefined): string {
  if (v === undefined) return "—";
  return String(v);
}

const EmpireOverview = ({
  players, cities, realmResource, militaryStacks, wonders, events,
  currentPlayerName, currentTurn, chronicles = [],
}: EmpireOverviewProps) => {
  const myCities = cities.filter(c => c.owner_player === currentPlayerName);
  const myWonders = wonders.filter(w => w.owner_player === currentPlayerName);
  const completedWonders = myWonders.filter(w => w.status === "completed");

  // Canonical adapters
  const myResources = adaptRealmResourceToRows(realmResource);
  const military = adaptMilitaryStacks(militaryStacks, currentPlayerName);

  const cityByLevel = LEVEL_ORDER.map(level => ({
    level,
    count: myCities.filter(c => c.level === level).length,
  })).filter(g => g.count > 0);

  const provinces = [...new Set(myCities.map(c => c.province).filter(Boolean))];

  const devastatedCities = myCities.filter(c => c.status === "devastated" || c.status === "besieged");
  const recentThreats = events.filter(
    e => e.turn_number === currentTurn &&
      (e.event_type === "raid" || e.event_type === "battle") &&
      myCities.some(c => c.id === e.city_id || c.id === e.secondary_city_id)
  );

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

        {/* Resources — canonical realm_resources via adapter */}
        <div className="manuscript-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Coins className="h-5 w-5 text-illuminated" />
            <h3 className="font-display font-semibold text-sm">Zdroje</h3>
          </div>
          <div className="space-y-1.5">
            {realmResource === null ? (
              <p className="text-xs text-muted-foreground italic">
                Říše ještě nemá inicializovaný kanonický stav (realm_resources).
              </p>
            ) : myResources.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Žádná data</p>
            ) : (
              myResources.map(r => {
                const surplus =
                  r.income !== undefined && r.upkeep !== undefined
                    ? r.income - r.upkeep
                    : r.income;
                const meta = RES_META[r.resource_type] ?? { label: r.resource_type, icon: null };
                return (
                  <div key={r.id} className="flex items-center gap-2 text-sm">
                    {meta.icon}
                    <span className="flex-1 text-xs">{meta.label}</span>
                    <span
                      className={`text-xs font-bold ${
                        surplus === undefined
                          ? "text-muted-foreground"
                          : surplus >= 0
                          ? "text-forest-green"
                          : "text-seal-red"
                      }`}
                      title={
                        r.income === undefined
                          ? "Income not tracked in canonical state yet"
                          : undefined
                      }
                    >
                      {fmtSigned(surplus)}
                    </span>
                    <span className="text-xs text-muted-foreground">📦{r.stockpile}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Military — military_stacks aggregate */}
        <div className="manuscript-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Swords className="h-5 w-5 text-illuminated" />
            <h3 className="font-display font-semibold text-sm">Armáda</h3>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>Aktivní stacky</span>
              <Badge variant="secondary" className="text-xs">{military.active}</Badge>
            </div>
            <div className="flex justify-between text-sm">
              <span>Celkem stacků</span>
              <Badge variant="outline" className="text-xs">{military.total}</Badge>
            </div>
            <p className="text-[10px] text-muted-foreground italic mt-1">
              Per-jednotkový rozpis — schema gap, viz BETA_SCOPE.
            </p>
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

      {/* Empire Demographics */}
      {myCities.length > 0 && (() => {
        const totalPop = myCities.reduce((s, c) => s + (c.population_total || 0), 0);
        const totalPeasants = myCities.reduce((s, c) => s + (c.population_peasants || 0), 0);
        const totalBurghers = myCities.reduce((s, c) => s + (c.population_burghers || 0), 0);
        const totalClerics = myCities.reduce((s, c) => s + (c.population_clerics || 0), 0);
        const avgStab = Math.round(myCities.reduce((s, c) => s + c.city_stability, 0) / myCities.length);
        const urbanRatio = totalPop > 0 ? ((totalBurghers + totalClerics) / totalPop * 100).toFixed(0) : "0";
        const overcrowded = myCities.filter(c => (c.population_total || 0) > ((c as any).housing_capacity || 500)).length;
        const epidemics = myCities.filter(c => (c as any).epidemic_active).length;
        return (
          <div className="manuscript-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-5 w-5 text-illuminated" />
              <h3 className="font-display font-semibold text-sm">Demografie říše</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="text-center">
                <p className="text-xl font-bold">{totalPop.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground">Celková populace</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold">{urbanRatio}%</p>
                <p className="text-[10px] text-muted-foreground">Urbanizace</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold">{avgStab}</p>
                <p className="text-[10px] text-muted-foreground">Prům. stabilita</p>
              </div>
              <div className="text-center">
                <p className={`text-xl font-bold ${overcrowded > 0 ? "text-destructive" : ""}`}>{overcrowded}</p>
                <p className="text-[10px] text-muted-foreground">Přelidněná města</p>
              </div>
            </div>
            <div className="mt-3 space-y-1">
              <div className="flex h-2 rounded-full overflow-hidden bg-muted">
                <div className="bg-primary/60" style={{ width: `${totalPop > 0 ? totalPeasants / totalPop * 100 : 0}%` }} />
                <div className="bg-accent" style={{ width: `${totalPop > 0 ? totalBurghers / totalPop * 100 : 0}%` }} />
                <div className="bg-muted-foreground/50" style={{ width: `${totalPop > 0 ? totalClerics / totalPop * 100 : 0}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>🌾 Sedláci {totalPeasants.toLocaleString()}</span>
                <span>⚒️ Měšťané {totalBurghers.toLocaleString()}</span>
                <span>⛪ Klérus {totalClerics.toLocaleString()}</span>
              </div>
            </div>
            {epidemics > 0 && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
                <HeartPulse className="h-3 w-3" />
                {epidemics} {epidemics === 1 ? "město" : "měst"} zasaženo epidemií
              </div>
            )}
          </div>
        );
      })()}

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
