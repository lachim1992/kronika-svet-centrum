import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Crown, Castle, Swords, Coins, Wheat, Trees, Mountain, Gem,
  AlertTriangle, Flame, Shield, Scroll, MapPin, Landmark, Bell
} from "lucide-react";
import RichText from "@/components/RichText";
import type { EntityIndex } from "@/hooks/useEntityIndex";

const EVENT_TYPE_ICONS: Record<string, string> = {
  battle: "⚔️", raid: "🔥", founding: "🏗️", trade: "💰", treaty: "🤝",
  alliance: "🤝", expedition: "🧭", discovery: "🔍", diplomacy: "📜",
  construction: "🏗️", decree: "📣", rebellion: "💥", migration: "🚶",
  religion: "⛪", cultural: "🎭", espionage: "🕵️", natural_disaster: "🌊",
};
const EVENT_TYPE_LABELS: Record<string, string> = {
  battle: "Bitva", raid: "Nájezd", founding: "Založení", trade: "Obchod",
  treaty: "Smlouva", alliance: "Aliance", expedition: "Výprava",
  discovery: "Objev", diplomacy: "Diplomacie", construction: "Stavba",
  decree: "Dekret", rebellion: "Povstání", migration: "Migrace",
  religion: "Náboženství", cultural: "Kultura", espionage: "Špionáž",
  natural_disaster: "Katastrofa",
};

interface Props {
  sessionId: string;
  session: any;
  events: any[];
  memories: any[];
  players: any[];
  cities: any[];
  resources: any[];
  armies: any[];
  wonders: any[];
  chronicles: any[];
  worldCrises: any[];
  currentPlayerName: string;
  currentTurn: number;
  myRole: string;
  entityIndex?: EntityIndex;
  onEventClick?: (eventId: string) => void;
  onEntityClick?: (type: string, id: string) => void;
}

const RESOURCE_ICONS: Record<string, React.ReactNode> = {
  food: <Wheat className="h-4 w-4 text-forest-green" />,
  wood: <Trees className="h-4 w-4 text-forest-green" />,
  stone: <Mountain className="h-4 w-4 text-muted-foreground" />,
  iron: <Gem className="h-4 w-4 text-royal-purple" />,
  wealth: <Coins className="h-4 w-4 text-illuminated" />,
};
const RESOURCE_LABELS: Record<string, string> = {
  food: "Jídlo", wood: "Dřevo", stone: "Kámen", iron: "Železo", wealth: "Zlato",
};

const HomeTab = ({
  events, cities, resources, armies, wonders, chronicles,
  worldCrises, currentPlayerName, currentTurn, entityIndex,
  onEventClick, onEntityClick,
}: Props) => {
  const myCities = cities.filter(c => c.owner_player === currentPlayerName);
  const myResources = resources.filter(r => r.player_name === currentPlayerName);
  const myArmies = armies.filter(a => a.player_name === currentPlayerName);
  const myWonders = wonders.filter(w => w.owner_player === currentPlayerName);
  const activeArmies = myArmies.filter(a => a.status === "Aktivní");
  const devastatedCities = myCities.filter(c => c.status === "devastated" || c.status === "besieged");
  const activeCrises = worldCrises.filter(c => !c.resolved);
  const recentEvents = events
    .filter(e => e.turn_number >= currentTurn - 1 && e.confirmed)
    .slice(-6);

  const provinces = [...new Set(myCities.map(c => c.province).filter(Boolean))];

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="text-center py-2">
        <h1 className="text-2xl font-decorative font-bold flex items-center justify-center gap-2">
          <Crown className="h-6 w-6 text-illuminated" />
          Moje říše
        </h1>
        <p className="text-sm text-muted-foreground font-display">
          {currentPlayerName} • Rok {currentTurn}
        </p>
      </div>

      {/* Threats Banner */}
      {(devastatedCities.length > 0 || activeCrises.length > 0) && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-sm font-display font-semibold text-destructive">Aktivní hrozby</span>
            </div>
            <div className="space-y-1">
              {devastatedCities.map(c => (
                <div key={c.id} className="flex items-center gap-2 text-sm">
                  <Flame className="h-3 w-3 text-destructive" />
                  <button className="hover:underline" onClick={() => onEntityClick?.("city", c.id)}>
                    {c.name}
                  </button>
                  <span> — {c.status === "devastated" ? "Zpustošeno" : "Obléháno"}</span>
                </div>
              ))}
              {activeCrises.map(c => (
                <div key={c.id} className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-3 w-3 text-destructive" />
                  <span>{c.title}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Cities */}
        <Card>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-sm flex items-center gap-2">
              <Castle className="h-4 w-4 text-illuminated" />
              Města
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-1">
            <div className="text-2xl font-bold font-display">{myCities.length}</div>
            {provinces.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {provinces.length} {provinces.length === 1 ? "provincie" : "provincií"}
              </p>
            )}
            <div className="mt-2 space-y-0.5">
              {myCities.slice(0, 3).map(c => (
                <button key={c.id} className="text-xs flex items-center gap-1 w-full hover:text-primary transition-colors"
                  onClick={() => onEntityClick?.("city", c.id)}>
                  <MapPin className="h-3 w-3 text-muted-foreground" />
                  <span className="truncate">{c.name}</span>
                  <Badge variant="outline" className="text-[9px] h-4 ml-auto">{c.level}</Badge>
                </button>
              ))}
              {myCities.length > 3 && (
                <p className="text-xs text-muted-foreground">+{myCities.length - 3} dalších</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Military */}
        <Card>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-sm flex items-center gap-2">
              <Swords className="h-4 w-4 text-illuminated" />
              Armáda
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-1">
            <div className="text-2xl font-bold font-display">{activeArmies.length}</div>
            <p className="text-xs text-muted-foreground mt-1">aktivních legií</p>
            <div className="mt-2 space-y-0.5">
              {activeArmies.slice(0, 3).map(a => (
                <div key={a.id} className="text-xs flex items-center gap-1">
                  <Shield className="h-3 w-3 text-muted-foreground" />
                  <span className="truncate">{a.army_name}</span>
                  <Badge variant="outline" className="text-[9px] h-4 ml-auto">{a.army_type}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Wonders */}
        <Card>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-sm flex items-center gap-2">
              <Landmark className="h-4 w-4 text-illuminated" />
              Divy
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-1">
            <div className="text-2xl font-bold font-display">
              {myWonders.filter(w => w.status === "completed").length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {myWonders.filter(w => w.status !== "completed").length} ve výstavbě
            </p>
          </CardContent>
        </Card>

        {/* Economy */}
        <Card>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-sm flex items-center gap-2">
              <Coins className="h-4 w-4 text-illuminated" />
              Ekonomika
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-1">
            <div className="space-y-1">
              {myResources.slice(0, 4).map(r => {
                const surplus = r.income - r.upkeep;
                return (
                  <div key={r.id} className="flex items-center gap-1.5 text-xs">
                    {RESOURCE_ICONS[r.resource_type]}
                    <span className="flex-1">{RESOURCE_LABELS[r.resource_type]}</span>
                    <span className={`font-bold ${surplus >= 0 ? "text-forest-green" : "text-seal-red"}`}>
                      {surplus >= 0 ? `+${surplus}` : surplus}
                    </span>
                    <span className="text-muted-foreground">({r.stockpile})</span>
                  </div>
                );
              })}
              {myResources.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Žádné zdroje</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Events */}
      <Card>
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bell className="h-4 w-4 text-illuminated" />
            Nedávné události
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          {recentEvents.length === 0 ? (
            <p className="text-xs text-muted-foreground italic text-center py-4">
              Žádné nedávné události
            </p>
          ) : (
            <div className="space-y-2">
              {[...recentEvents].reverse().map(e => {
                const eventCity = e.city_id ? cities.find(c => c.id === e.city_id) : null;
                const secondaryCity = e.secondary_city_id ? cities.find(c => c.id === e.secondary_city_id) : null;
                const attackerCity = e.attacker_city_id ? cities.find(c => c.id === e.attacker_city_id) : null;
                const defenderCity = e.defender_city_id ? cities.find(c => c.id === e.defender_city_id) : null;

                const entityChips: { type: string; id: string; label: string }[] = [];
                if (eventCity) entityChips.push({ type: "city", id: eventCity.id, label: eventCity.name });
                if (attackerCity && attackerCity.id !== eventCity?.id) entityChips.push({ type: "city", id: attackerCity.id, label: attackerCity.name });
                if (defenderCity && defenderCity.id !== eventCity?.id) entityChips.push({ type: "city", id: defenderCity.id, label: defenderCity.name });
                if (secondaryCity && !entityChips.find(c => c.id === secondaryCity.id)) entityChips.push({ type: "city", id: secondaryCity.id, label: secondaryCity.name });

                const typeIcon = EVENT_TYPE_ICONS[e.event_type] || "📜";
                const importanceBadge = e.importance === "critical" ? "destructive" as const : e.importance === "major" ? "default" as const : "outline" as const;

                return (
                  <button
                    key={e.id}
                    className="w-full text-left p-2.5 rounded-md bg-muted/30 hover:bg-muted/60 transition-colors cursor-pointer border border-transparent hover:border-border/50 group"
                    onClick={() => onEventClick?.(e.id)}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-sm shrink-0 mt-0.5">{typeIcon}</span>
                      <div className="flex-1 min-w-0">
                        {/* Title line: player + action */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-semibold">{e.player}</span>
                          <Badge variant={importanceBadge} className="text-[9px] h-4 px-1.5">{EVENT_TYPE_LABELS[e.event_type] || e.event_type}</Badge>
                          <span className="text-[10px] text-muted-foreground ml-auto shrink-0">Rok {e.turn_number}</span>
                        </div>

                        {/* Note with RichText */}
                        {e.note && (
                          <div className="mt-0.5" onClick={(ev) => ev.stopPropagation()}>
                            <RichText
                              text={e.note}
                              entityIndex={entityIndex}
                              onEventClick={onEventClick}
                              onEntityClick={onEntityClick}
                              className="text-xs text-muted-foreground line-clamp-2"
                            />
                          </div>
                        )}

                        {/* Entity chips row */}
                        {(entityChips.length > 0 || e.location) && (
                          <div className="flex items-center gap-1 flex-wrap mt-1" onClick={(ev) => ev.stopPropagation()}>
                            {entityChips.map(chip => (
                              <button
                                key={chip.id}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[10px] font-medium bg-primary/10 text-primary border-primary/30 hover:bg-primary/20 transition-colors"
                                onClick={(ev) => { ev.stopPropagation(); onEntityClick?.(chip.type, chip.id); }}
                              >
                                🏛️ {chip.label}
                              </button>
                            ))}
                            {e.location && !entityChips.some(c => c.label === e.location) && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground">
                                📍 {e.location}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      {/* Arrow indicator */}
                      <span className="text-muted-foreground text-xs opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">→</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Last Chronicle */}
      {chronicles.length > 0 && (
        <Card className="border-t-2 border-t-primary/30">
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Scroll className="h-4 w-4 text-illuminated" />
              Poslední zápis v kronice
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <RichText
              text={chronicles[chronicles.length - 1].text}
              entityIndex={entityIndex}
              onEventClick={onEventClick}
              onEntityClick={onEntityClick}
              className="text-xs leading-relaxed line-clamp-4 whitespace-pre-wrap"
            />
            <p className="text-[10px] text-muted-foreground mt-2">
              {new Date(chronicles[chronicles.length - 1].created_at).toLocaleString("cs-CZ")}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default HomeTab;
