import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Crown, Castle, Swords, Coins, Wheat, Trees, Mountain, Gem,
  AlertTriangle, Flame, Shield, Scroll, MapPin, Landmark, Bell
} from "lucide-react";

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
  onEventClick?: (eventId: string) => void;
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
  worldCrises, currentPlayerName, currentTurn,
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
                  <span>{c.name} — {c.status === "devastated" ? "Zpustošeno" : "Obléháno"}</span>
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
                <div key={c.id} className="text-xs flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-muted-foreground" />
                  <span className="truncate">{c.name}</span>
                  <Badge variant="outline" className="text-[9px] h-4 ml-auto">{c.level}</Badge>
                </div>
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

      {/* Recent Events / Notifications */}
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
              {[...recentEvents].reverse().map(e => (
                <div key={e.id} className="flex items-start gap-2 p-2 rounded-md bg-muted/30">
                  <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5">{e.event_type}</Badge>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-semibold">{e.player}</span>
                    {e.note && <span className="text-xs text-muted-foreground"> — {e.note}</span>}
                    {e.location && <span className="text-[10px] text-muted-foreground block">📍 {e.location}</span>}
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">Rok {e.turn_number}</span>
                </div>
              ))}
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
            <p className="text-xs leading-relaxed line-clamp-4 whitespace-pre-wrap">
              {chronicles[chronicles.length - 1].text}
            </p>
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
