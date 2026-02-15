import type { Tables } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Trophy, Castle, Coins, Swords, Landmark, Flame } from "lucide-react";

type GamePlayer = Tables<"game_players">;
type City = Tables<"cities">;
type PlayerResource = Tables<"player_resources">;
type MilitaryCapacity = Tables<"military_capacity">;
type Wonder = Tables<"wonders">;
type GameEvent = Tables<"game_events">;
type ChronicleEntry = Tables<"chronicle_entries">;

const CITY_LEVEL_SCORE: Record<string, number> = {
  Polis: 4, Město: 3, Městečko: 2, Osada: 1,
};

interface LeaderboardsPanelProps {
  players: GamePlayer[];
  cities: City[];
  resources: PlayerResource[];
  armies: MilitaryCapacity[];
  wonders: Wonder[];
  events: GameEvent[];
  chronicles: ChronicleEntry[];
}

interface RankedPlayer {
  name: string;
  score: number;
  detail: string;
}

const LeaderboardsPanel = ({ players, cities, resources, armies, wonders, events, chronicles }: LeaderboardsPanelProps) => {
  const playerNames = players.map(p => p.player_name);

  // 1. Biggest cities
  const cityRanking: RankedPlayer[] = playerNames.map(pn => {
    const playerCities = cities.filter(c => c.owner_player === pn);
    const score = playerCities.reduce((s, c) => s + (CITY_LEVEL_SCORE[c.level] || 0), 0);
    const topCity = playerCities.sort((a, b) => (CITY_LEVEL_SCORE[b.level] || 0) - (CITY_LEVEL_SCORE[a.level] || 0))[0];
    return { name: pn, score, detail: `${playerCities.length} měst${topCity ? ` (${topCity.name})` : ""}` };
  }).sort((a, b) => b.score - a.score);

  // 2. Richest empires
  const wealthRanking: RankedPlayer[] = playerNames.map(pn => {
    const playerRes = resources.filter(r => r.player_name === pn);
    const totalSurplus = playerRes.reduce((s, r) => s + (r.income - r.upkeep), 0);
    const totalStockpile = playerRes.reduce((s, r) => s + r.stockpile, 0);
    return { name: pn, score: totalSurplus + totalStockpile, detail: `+${totalSurplus}/kolo, 📦${totalStockpile}` };
  }).sort((a, b) => b.score - a.score);

  // 3. Biggest armies
  const armyRanking: RankedPlayer[] = playerNames.map(pn => {
    const active = armies.filter(a => a.player_name === pn && a.status === "Aktivní");
    return { name: pn, score: active.length, detail: `${active.length} aktivních legií` };
  }).sort((a, b) => b.score - a.score);

  // 4. Cultural glory (wonders + chronicles)
  const cultureRanking: RankedPlayer[] = playerNames.map(pn => {
    const playerWonders = wonders.filter(w => w.owner_player === pn && w.status === "completed");
    const prestigePoints = playerWonders.length * 10 + chronicles.length; // simplified
    return { name: pn, score: prestigePoints, detail: `${playerWonders.length} divů, ${chronicles.length} kronik` };
  }).sort((a, b) => b.score - a.score);

  // 5. Most devastated
  const raidRanking: RankedPlayer[] = playerNames.map(pn => {
    const raids = events.filter(e => (e.event_type === "raid" || e.event_type === "battle") && e.location);
    const playerRaids = raids.filter(e => e.player === pn);
    return { name: pn, score: playerRaids.length, detail: `${playerRaids.length} nájezdů/bitev` };
  }).sort((a, b) => b.score - a.score);

  const boards = [
    { title: "Největší města", icon: <Castle className="h-5 w-5" />, data: cityRanking },
    { title: "Nejbohatší říše", icon: <Coins className="h-5 w-5" />, data: wealthRanking },
    { title: "Největší armády", icon: <Swords className="h-5 w-5" />, data: armyRanking },
    { title: "Kulturní sláva", icon: <Landmark className="h-5 w-5" />, data: cultureRanking },
    { title: "Nejaktivnější válečníci", icon: <Flame className="h-5 w-5" />, data: raidRanking },
  ];

  return (
    <div className="space-y-6 p-4">
      <h1 className="text-2xl font-display font-bold flex items-center gap-2">
        <Trophy className="h-6 w-6 text-primary" />
        Žebříčky říší
      </h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {boards.map(board => (
          <div key={board.title} className="bg-card p-4 rounded-lg border border-border shadow-parchment">
            <h3 className="font-display font-semibold text-sm flex items-center gap-2 mb-3 text-primary">
              {board.icon}
              {board.title}
            </h3>
            <div className="space-y-2">
              {board.data.map((entry, idx) => (
                <div key={entry.name} className={`flex items-center gap-2 p-2 rounded text-sm ${idx === 0 && entry.score > 0 ? "bg-primary/10 border border-primary/20" : "bg-muted/30"}`}>
                  <span className="font-display font-bold w-6 text-center text-muted-foreground">
                    {idx === 0 && entry.score > 0 ? "👑" : `${idx + 1}.`}
                  </span>
                  <span className="font-semibold flex-1">{entry.name}</span>
                  <Badge variant="secondary" className="text-xs">{entry.score}</Badge>
                  <span className="text-xs text-muted-foreground hidden md:inline">{entry.detail}</span>
                </div>
              ))}
              {board.data.length === 0 && (
                <p className="text-xs text-muted-foreground italic text-center py-2">Žádná data</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LeaderboardsPanel;
