import type { Tables } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Shield, Flame, Swords, MapPin, AlertTriangle, Castle } from "lucide-react";

type City = Tables<"cities">;
type MilitaryCapacity = Tables<"military_capacity">;
type GameEvent = Tables<"game_events">;
type GamePlayer = Tables<"game_players">;

interface WarRoomPanelProps {
  cities: City[];
  armies: MilitaryCapacity[];
  events: GameEvent[];
  players: GamePlayer[];
  currentTurn: number;
  worldCrises: any[];
}

const WarRoomPanel = ({ cities, armies, events, players, currentTurn, worldCrises }: WarRoomPanelProps) => {
  const provinces = [...new Set(cities.map(c => c.province).filter(Boolean))];
  const devastatedCities = cities.filter(c => c.status === "devastated" || c.status === "besieged");
  const recentBattles = events.filter(e => e.turn_number >= currentTurn - 2 && (e.event_type === "battle" || e.event_type === "raid") && e.confirmed);
  const activeCrises = worldCrises.filter((c: any) => !c.resolved);

  return (
    <div className="space-y-6 px-4">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-decorative font-bold flex items-center justify-center gap-3">
          <Swords className="h-7 w-7 text-seal-red" />
          Válečná mapa
        </h1>
        <p className="text-sm text-muted-foreground">Strategický přehled světa — Rok {currentTurn}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Province overview */}
        {provinces.map(prov => {
          const provCities = cities.filter(c => c.province === prov);
          const owners = [...new Set(provCities.map(c => c.owner_player))];
          const contested = owners.length > 1;
          const hasThreat = provCities.some(c => c.status === "devastated" || c.status === "besieged");

          return (
            <div key={prov} className={`manuscript-card p-4 space-y-2 ${contested ? "border-l-4" : ""}`}
              style={contested ? { borderLeftColor: "hsl(var(--seal-red))" } : {}}>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-illuminated" />
                <h3 className="font-display font-semibold text-sm">{prov}</h3>
                {contested && <Badge variant="destructive" className="text-xs">Sporné</Badge>}
                {hasThreat && <AlertTriangle className="h-4 w-4 text-destructive" />}
              </div>
              <div className="space-y-1">
                {provCities.map(c => (
                  <div key={c.id} className="flex items-center gap-2 text-xs">
                    <Castle className="h-3 w-3 text-muted-foreground" />
                    <span className={c.status === "devastated" ? "line-through text-destructive" : ""}>
                      {c.name}
                    </span>
                    <span className="text-muted-foreground">({c.owner_player})</span>
                    {c.status === "devastated" && <Flame className="h-3 w-3 text-destructive" />}
                    {c.status === "besieged" && <Shield className="h-3 w-3 text-yellow-600" />}
                  </div>
                ))}
              </div>
              <div className="text-xs text-muted-foreground">
                Kontrola: {owners.join(" vs ")}
              </div>
            </div>
          );
        })}

        {/* Unassigned cities */}
        {cities.filter(c => !c.province).length > 0 && (
          <div className="manuscript-card p-4 space-y-2">
            <h3 className="font-display font-semibold text-sm text-muted-foreground">Bez provincie</h3>
            {cities.filter(c => !c.province).map(c => (
              <div key={c.id} className="flex items-center gap-2 text-xs">
                <Castle className="h-3 w-3" />
                <span>{c.name}</span>
                <span className="text-muted-foreground">({c.owner_player})</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active world crises */}
      {activeCrises.length > 0 && (
        <div className="manuscript-card p-4 space-y-3" style={{ borderTopColor: "hsl(var(--destructive))", borderTopWidth: "3px" }}>
          <h3 className="font-display font-semibold text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" /> Světové krize
          </h3>
          {activeCrises.map((cr: any) => (
            <div key={cr.id} className="p-3 rounded bg-destructive/10 border border-destructive/20 space-y-1">
              <p className="font-display font-bold text-sm">{cr.title}</p>
              <p className="text-xs text-muted-foreground">{cr.description}</p>
              <p className="text-xs text-muted-foreground">Propuklo: Rok {cr.trigger_round}</p>
            </div>
          ))}
        </div>
      )}

      {/* Military overview per player */}
      <div className="manuscript-card p-4 space-y-3">
        <h3 className="font-display font-semibold text-sm flex items-center gap-2">
          <Swords className="h-4 w-4 text-illuminated" /> Vojenská síla
        </h3>
        {players.map(p => {
          const pArmies = armies.filter(a => a.player_name === p.player_name && a.status === "Aktivní");
          const pCities = cities.filter(c => c.owner_player === p.player_name);
          return (
            <div key={p.id} className="flex items-center gap-3 text-sm">
              <span className="font-display font-semibold w-24">{p.player_name}</span>
              <Badge variant="outline" className="text-xs">{pCities.length} měst</Badge>
              <Badge variant="secondary" className="text-xs">{pArmies.length} legií</Badge>
            </div>
          );
        })}
      </div>

      {/* Recent battles */}
      {recentBattles.length > 0 && (
        <div className="manuscript-card p-4 space-y-2">
          <h3 className="font-display font-semibold text-sm">Nedávné bitvy</h3>
          {recentBattles.map(e => (
            <div key={e.id} className="flex items-center gap-2 text-xs p-2 rounded bg-muted/30">
              <Swords className="h-3 w-3 text-seal-red" />
              <span className="font-semibold">{e.player}</span>
              <span className="text-muted-foreground">{e.note || e.event_type}</span>
              {e.location && <span className="text-muted-foreground">📍 {e.location}</span>}
              <span className="text-muted-foreground ml-auto">Rok {e.turn_number}</span>
            </div>
          ))}
        </div>
      )}

      {/* Devastated areas */}
      {devastatedCities.length > 0 && (
        <div className="manuscript-card p-4 space-y-2">
          <h3 className="font-display font-semibold text-sm text-destructive flex items-center gap-2">
            <Flame className="h-4 w-4" /> Zpustošené oblasti
          </h3>
          {devastatedCities.map(c => (
            <div key={c.id} className="flex items-center gap-2 text-xs">
              <Flame className="h-3 w-3 text-destructive" />
              <span className="font-semibold">{c.name}</span>
              <span className="text-muted-foreground">({c.province || "bez provincie"})</span>
              {c.ruins_note && <span className="italic text-muted-foreground">— {c.ruins_note}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default WarRoomPanel;
