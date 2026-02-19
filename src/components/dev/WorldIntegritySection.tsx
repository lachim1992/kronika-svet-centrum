import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Shield, AlertTriangle, CheckCircle2, Link2, Globe } from "lucide-react";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  onRefetch?: () => void;
}

interface HealthReport {
  countries: number;
  regions: number;
  regionsWithoutCountry: { id: string; name: string }[];
  provinces: number;
  provincesWithoutRegion: { id: string; name: string }[];
  cities: number;
  citiesWithoutProvince: { id: string; name: string }[];
  wondersWithoutCity: { id: string; name: string }[];
  orphanedWiki: { id: string; name: string; type: string }[];
}

const WorldIntegritySection = ({ sessionId, onRefetch }: Props) => {
  const [scanning, setScanning] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [report, setReport] = useState<HealthReport | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) => setLog(prev => [...prev.slice(-50), `[${new Date().toLocaleTimeString("cs")}] ${msg}`]);

  const scan = useCallback(async () => {
    setScanning(true);
    try {
      const [
        { data: countries }, { data: regions }, { data: provinces },
        { data: cities }, { data: wonders },
      ] = await Promise.all([
        supabase.from("countries").select("id, name").eq("session_id", sessionId),
        supabase.from("regions").select("id, name, country_id").eq("session_id", sessionId),
        supabase.from("provinces").select("id, name, region_id").eq("session_id", sessionId),
        supabase.from("cities").select("id, name, province_id").eq("session_id", sessionId),
        supabase.from("wonders").select("id, name, city_name").eq("session_id", sessionId),
      ]);

      setReport({
        countries: countries?.length || 0,
        regions: regions?.length || 0,
        regionsWithoutCountry: (regions || []).filter(r => !r.country_id).map(r => ({ id: r.id, name: r.name })),
        provinces: provinces?.length || 0,
        provincesWithoutRegion: (provinces || []).filter(p => !p.region_id).map(p => ({ id: p.id, name: p.name })),
        cities: cities?.length || 0,
        citiesWithoutProvince: (cities || []).filter(c => !c.province_id).map(c => ({ id: c.id, name: c.name })),
        wondersWithoutCity: (wonders || []).filter(w => !w.city_name).map(w => ({ id: w.id, name: w.name })),
        orphanedWiki: [],
      });
    } catch (e: any) {
      toast.error("Skenování selhalo: " + (e?.message || ""));
    }
    setScanning(false);
  }, [sessionId]);

  const fixLinks = async () => {
    if (!report) return;
    setFixing(true);
    addLog("🔧 Opravuji chybějící vazby...");

    try {
      // Auto-create a default country if none exists and there are regions without country
      if (report.regionsWithoutCountry.length > 0) {
        let countryId: string | null = null;

        const { data: existing } = await supabase.from("countries").select("id").eq("session_id", sessionId).limit(1);
        if (existing?.length) {
          countryId = existing[0].id;
          addLog(`📌 Používám existující stát: ${countryId.slice(0, 8)}`);
        } else {
          const { data: newCountry } = await supabase.from("countries").insert({
            session_id: sessionId, name: "Výchozí stát", ruler_player: null,
            description: "Automaticky vytvořený stát pro opravu hierarchie.",
          }).select().single();
          if (newCountry) { countryId = newCountry.id; addLog(`✅ Vytvořen výchozí stát`); }
        }

        if (countryId) {
          for (const reg of report.regionsWithoutCountry) {
            await supabase.from("regions").update({ country_id: countryId }).eq("id", reg.id);
            addLog(`🔗 Region "${reg.name}" → stát`);
          }
        }
      }

      // Link provinces without region to closest matching region
      if (report.provincesWithoutRegion.length > 0) {
        const { data: regions } = await supabase.from("regions").select("id, name").eq("session_id", sessionId).limit(1);
        if (regions?.length) {
          for (const prov of report.provincesWithoutRegion) {
            await supabase.from("provinces").update({ region_id: regions[0].id }).eq("id", prov.id);
            addLog(`🔗 Provincie "${prov.name}" → region "${regions[0].name}"`);
          }
        } else {
          addLog("⚠️ Žádný region pro přiřazení provincií");
        }
      }

      // Link cities without province
      if (report.citiesWithoutProvince.length > 0) {
        const { data: provinces } = await supabase.from("provinces").select("id, name").eq("session_id", sessionId).limit(1);
        if (provinces?.length) {
          for (const city of report.citiesWithoutProvince) {
            await supabase.from("cities").update({ province_id: provinces[0].id }).eq("id", city.id);
            addLog(`🔗 Město "${city.name}" → provincie "${provinces[0].name}"`);
          }
        } else {
          addLog("⚠️ Žádná provincie pro přiřazení měst");
        }
      }

      addLog("✅ Oprava dokončena");
      toast.success("Vazby opraveny");
      onRefetch?.();
      scan();
    } catch (e: any) {
      addLog("❌ " + (e?.message || ""));
      toast.error("Oprava selhala");
    }
    setFixing(false);
  };

  const totalIssues = report
    ? report.regionsWithoutCountry.length + report.provincesWithoutRegion.length + report.citiesWithoutProvince.length + report.wondersWithoutCity.length
    : 0;

  return (
    <div className="bg-card border-2 border-yellow-500/20 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-sm flex items-center gap-2">
          <Shield className="h-4 w-4 text-yellow-500" />
          Integrita světové hierarchie
        </h3>
        <Button size="sm" variant="ghost" onClick={scan} disabled={scanning}>
          {scanning ? <Loader2 className="h-3 w-3 animate-spin" /> : "Skenovat"}
        </Button>
      </div>

      {/* Hierarchy explanation */}
      <div className="text-xs text-muted-foreground p-2 bg-muted/20 rounded border">
        <span className="font-semibold">Hierarchie:</span> Stát → Region → Provincie → Město/Entita
      </div>

      {report && (
        <>
          {/* Counts */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Státy", count: report.countries, icon: Globe },
              { label: "Regiony", count: report.regions, icon: Globe },
              { label: "Provincie", count: report.provinces, icon: Globe },
              { label: "Města", count: report.cities, icon: Globe },
            ].map(s => (
              <div key={s.label} className="text-center p-2 border rounded">
                <p className="text-lg font-bold">{s.count}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Issues */}
          <div className="space-y-1">
            {totalIssues === 0 ? (
              <div className="flex items-center gap-2 p-2 rounded bg-primary/10 text-primary text-sm">
                <CheckCircle2 className="h-4 w-4" />
                Všechny vazby jsou v pořádku
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 p-2 rounded bg-destructive/10 text-destructive text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  {totalIssues} problémů s vazbami
                </div>
                {report.regionsWithoutCountry.length > 0 && (
                  <IssueRow label="Regiony bez státu" items={report.regionsWithoutCountry} />
                )}
                {report.provincesWithoutRegion.length > 0 && (
                  <IssueRow label="Provincie bez regionu" items={report.provincesWithoutRegion} />
                )}
                {report.citiesWithoutProvince.length > 0 && (
                  <IssueRow label="Města bez provincie" items={report.citiesWithoutProvince} />
                )}
                {report.wondersWithoutCity.length > 0 && (
                  <IssueRow label="Divy bez města" items={report.wondersWithoutCity} />
                )}
                <Button onClick={fixLinks} disabled={fixing} className="w-full h-10 gap-2" variant="outline">
                  {fixing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                  {fixing ? "Opravuji..." : "🔧 Opravit vazby"}
                </Button>
              </>
            )}
          </div>
        </>
      )}

      {!report && !scanning && (
        <Button onClick={scan} variant="outline" className="w-full">
          Spustit kontrolu integrity
        </Button>
      )}

      {log.length > 0 && (
        <ScrollArea className="h-24 border rounded p-2 bg-muted/30">
          <div className="font-mono text-[11px] space-y-0.5">
            {log.map((line, i) => (
              <p key={i} className="text-muted-foreground">{line}</p>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};

const IssueRow = ({ label, items }: { label: string; items: { id: string; name: string }[] }) => (
  <div className="p-2 rounded border bg-muted/20 text-xs">
    <div className="flex items-center justify-between mb-1">
      <span className="font-semibold">{label}</span>
      <Badge variant="destructive" className="text-[10px]">{items.length}</Badge>
    </div>
    <div className="flex flex-wrap gap-1">
      {items.slice(0, 10).map(item => (
        <Badge key={item.id} variant="outline" className="text-[10px]">{item.name}</Badge>
      ))}
      {items.length > 10 && <span className="text-muted-foreground">+{items.length - 10}</span>}
    </div>
  </div>
);

export default WorldIntegritySection;
