import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, TrendingDown, TrendingUp, Minus } from "lucide-react";

interface CityMetrics {
  name: string;
  population_total: number;
  city_stability: number;
  local_grain_reserve: number;
  legitimacy: number;
  local_renown: number;
  influence_score: number;
  development_level: number;
  migration_pressure: number;
  disease_level: number;
  vulnerability_score: number;
  famine_turn: boolean;
  military_garrison: number;
  settlement_level: string;
  overcrowding_ratio: number;
}

interface Props {
  sessionId: string;
}

const LiveMetricsPanel = ({ sessionId }: Props) => {
  const [cities, setCities] = useState<CityMetrics[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("cities")
        .select("name, population_total, city_stability, local_grain_reserve, legitimacy, local_renown, influence_score, development_level, migration_pressure, disease_level, vulnerability_score, famine_turn, military_garrison, settlement_level, overcrowding_ratio")
        .eq("session_id", sessionId)
        .neq("status", "ruins")
        .order("population_total", { ascending: false });
      setCities((data as CityMetrics[]) || []);
      setLoading(false);
    };
    fetchMetrics();
  }, [sessionId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Načítám live metriky…
      </div>
    );
  }

  if (cities.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">Žádná města v této session.</p>;
  }

  // Aggregates
  const totalPop = cities.reduce((s, c) => s + c.population_total, 0);
  const avgStability = cities.reduce((s, c) => s + c.city_stability, 0) / cities.length;
  const famineCities = cities.filter(c => c.famine_turn).length;
  const deadMetricAvg = cities.reduce((s, c) => s + c.legitimacy, 0) / cities.length;
  const hiddenAvg = cities.reduce((s, c) => s + c.vulnerability_score, 0) / cities.length;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Live hodnoty z DB pro aktuální session — {cities.length} měst.
      </p>

      {/* Aggregate stats */}
      <div className="grid grid-cols-5 gap-2">
        <AggCard label="Celková populace" value={totalPop.toLocaleString()} />
        <AggCard label="Prům. stabilita" value={`${avgStability.toFixed(1)}%`} warn={avgStability < 50} />
        <AggCard label="Města v hladomoru" value={String(famineCities)} warn={famineCities > 0} />
        <AggCard label="Prům. legitimita" value={deadMetricAvg.toFixed(1)} dead />
        <AggCard label="Prům. vulnerability" value={hiddenAvg.toFixed(1)} hidden />
      </div>

      {/* Per-city table */}
      <div className="border rounded-lg overflow-auto max-h-[400px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs w-[130px]">Město</TableHead>
              <TableHead className="text-xs text-center">Pop</TableHead>
              <TableHead className="text-xs text-center">Stab%</TableHead>
              <TableHead className="text-xs text-center">Grain</TableHead>
              <TableHead className="text-xs text-center">Garrison</TableHead>
              <TableHead className="text-xs text-center">Legit</TableHead>
              <TableHead className="text-xs text-center">Renown</TableHead>
              <TableHead className="text-xs text-center">Influence</TableHead>
              <TableHead className="text-xs text-center">DevLvl</TableHead>
              <TableHead className="text-xs text-center">Vuln</TableHead>
              <TableHead className="text-xs text-center">Disease</TableHead>
              <TableHead className="text-xs text-center">Migration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cities.map((city) => (
              <TableRow key={city.name} className={city.famine_turn ? "bg-destructive/10" : ""}>
                <TableCell className="font-mono text-[10px] font-bold py-1.5">
                  {city.name}
                  <span className="text-muted-foreground ml-1">({city.settlement_level})</span>
                </TableCell>
                <TableCell className="text-center text-[10px] py-1.5">{city.population_total}</TableCell>
                <TableCell className="text-center py-1.5">
                  <span className={`text-[10px] font-bold ${city.city_stability < 30 ? "text-red-500" : city.city_stability < 60 ? "text-yellow-500" : "text-green-500"}`}>
                    {city.city_stability.toFixed(0)}
                  </span>
                </TableCell>
                <TableCell className="text-center text-[10px] py-1.5">
                  <span className={city.local_grain_reserve < 10 ? "text-red-500 font-bold" : ""}>
                    {city.local_grain_reserve.toFixed(0)}
                  </span>
                </TableCell>
                <TableCell className="text-center text-[10px] py-1.5">{city.military_garrison}</TableCell>
                <TableCell className="text-center text-[10px] py-1.5 text-muted-foreground">{city.legitimacy.toFixed(1)}</TableCell>
                <TableCell className="text-center text-[10px] py-1.5">{city.local_renown.toFixed(0)}</TableCell>
                <TableCell className="text-center text-[10px] py-1.5">{city.influence_score.toFixed(0)}</TableCell>
                <TableCell className="text-center text-[10px] py-1.5">{city.development_level}</TableCell>
                <TableCell className="text-center py-1.5">
                  <span className={`text-[10px] ${city.vulnerability_score > 50 ? "text-red-500 font-bold" : "text-muted-foreground"}`}>
                    {city.vulnerability_score.toFixed(0)}
                  </span>
                </TableCell>
                <TableCell className="text-center py-1.5">
                  <span className={`text-[10px] ${city.disease_level > 0.3 ? "text-red-500" : "text-muted-foreground"}`}>
                    {city.disease_level.toFixed(2)}
                  </span>
                </TableCell>
                <TableCell className="text-center py-1.5">
                  <span className={`text-[10px] ${city.migration_pressure > 0.5 ? "text-yellow-500" : "text-muted-foreground"}`}>
                    {city.migration_pressure.toFixed(2)}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Dead metrics highlight */}
      <div className="border rounded-lg p-3 bg-destructive/5">
        <h4 className="text-xs font-bold text-destructive mb-2">⚠️ Dead / Izolované metriky (live kontrola)</h4>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <DeadCheck label="legitimacy" values={cities.map(c => c.legitimacy)} note="Zapisuje world-tick, ale NIKDO nečte" />
          <DeadCheck label="migration_pressure" values={cities.map(c => c.migration_pressure)} note="Počítá se, ale nemá downstream" />
          <DeadCheck label="vulnerability_score" values={cities.map(c => c.vulnerability_score)} note="Pouze AI — hráč nevidí" />
          <DeadCheck label="development_level" values={cities.map(c => c.development_level)} note="UI zobrazuje, ale chybí milníky" />
        </div>
      </div>
    </div>
  );
};

function AggCard({ label, value, warn, dead, hidden }: { label: string; value: string; warn?: boolean; dead?: boolean; hidden?: boolean }) {
  return (
    <div className={`text-center p-2 rounded bg-card border ${warn ? "border-destructive/50" : ""} ${dead ? "border-yellow-500/50" : ""}`}>
      <p className={`text-lg font-bold ${warn ? "text-destructive" : dead ? "text-yellow-500" : hidden ? "text-purple-400" : "text-foreground"}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      {dead && <Badge variant="outline" className="text-[8px] mt-1">DEAD METRIC</Badge>}
      {hidden && <Badge variant="outline" className="text-[8px] mt-1">AI ONLY</Badge>}
    </div>
  );
}

function DeadCheck({ label, values, note }: { label: string; values: number[]; note: string }) {
  const avg = values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
  const allZero = values.every(v => v === 0);
  const allSame = values.every(v => v === values[0]);

  return (
    <div className="flex items-start gap-2 p-1.5 bg-card rounded border">
      <div className="flex-1">
        <span className="font-mono font-bold">{label}</span>
        <p className="text-muted-foreground text-[10px]">{note}</p>
      </div>
      <div className="text-right">
        <p className="font-mono text-[10px]">avg: {avg.toFixed(2)}</p>
        {allZero && <Badge variant="destructive" className="text-[8px]">Vše 0</Badge>}
        {allSame && !allZero && <Badge variant="outline" className="text-[8px]">Konstantní</Badge>}
      </div>
    </div>
  );
}

export default LiveMetricsPanel;
