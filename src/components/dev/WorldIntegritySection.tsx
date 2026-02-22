import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Shield, AlertTriangle, CheckCircle2, Link2, Globe, Trash2 } from "lucide-react";
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
        { data: cities }, { data: wonders }, { data: wikiEntries },
      ] = await Promise.all([
        supabase.from("countries").select("id, name").eq("session_id", sessionId),
        supabase.from("regions").select("id, name, country_id").eq("session_id", sessionId),
        supabase.from("provinces").select("id, name, region_id").eq("session_id", sessionId),
        supabase.from("cities").select("id, name, province_id").eq("session_id", sessionId),
        supabase.from("wonders").select("id, name, city_name").eq("session_id", sessionId),
        supabase.from("wiki_entries").select("id, entity_name, entity_type, entity_id").eq("session_id", sessionId).eq("entity_type", "city"),
      ]);

      // Find orphaned wiki entries (entity_id doesn't match any city)
      const cityIdSet = new Set((cities || []).map(c => c.id));
      const orphanedWiki = (wikiEntries || [])
        .filter(w => !cityIdSet.has(w.entity_id))
        .map(w => ({ id: w.id, name: w.entity_name, type: w.entity_type }));

      setReport({
        countries: countries?.length || 0,
        regions: regions?.length || 0,
        regionsWithoutCountry: (regions || []).filter(r => !r.country_id).map(r => ({ id: r.id, name: r.name })),
        provinces: provinces?.length || 0,
        provincesWithoutRegion: (provinces || []).filter(p => !p.region_id).map(p => ({ id: p.id, name: p.name })),
        cities: cities?.length || 0,
        citiesWithoutProvince: (cities || []).filter(c => !c.province_id).map(c => ({ id: c.id, name: c.name })),
        wondersWithoutCity: (wonders || []).filter(w => !w.city_name).map(w => ({ id: w.id, name: w.name })),
        orphanedWiki,
      });
    } catch (e: any) {
      toast.error("Skenování selhalo: " + (e?.message || ""));
    }
    setScanning(false);
  }, [sessionId]);

  // Auto-scan on mount
  useEffect(() => { scan(); }, [scan]);

  const fixLinks = async () => {
    if (!report) return;
    setFixing(true);
    addLog("🔧 Opravuji chybějící vazby...");

    try {
      // 1) Create country if needed and link regions
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

      // 2) Link provinces without region
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

      // 3) Link cities without province — create province if none exist
      if (report.citiesWithoutProvince.length > 0) {
        let { data: provinces } = await supabase.from("provinces").select("id, name").eq("session_id", sessionId).limit(1);
        if (!provinces?.length) {
          // Create a default province
          const { data: regions } = await supabase.from("regions").select("id").eq("session_id", sessionId).limit(1);
          const { data: newProv } = await supabase.from("provinces").insert({
            session_id: sessionId, name: "Výchozí provincie", owner_player: "system",
            region_id: regions?.[0]?.id || null,
          }).select("id, name").single();
          if (newProv) {
            provinces = [newProv];
            addLog(`✅ Vytvořena výchozí provincie`);
          }
        }
        if (provinces?.length) {
          for (const city of report.citiesWithoutProvince) {
            await supabase.from("cities").update({ province_id: provinces[0].id }).eq("id", city.id);
            addLog(`🔗 Město "${city.name}" → provincie "${provinces[0].name}"`);
          }
        }
      }

      // 4) Delete orphaned wiki entries
      if (report.orphanedWiki.length > 0) {
        for (const w of report.orphanedWiki) {
          await supabase.from("wiki_entries").delete().eq("id", w.id);
          addLog(`🗑️ Smazán sirotčí wiki záznam: "${w.name}"`);
        }
      }

      // 5) Log to simulation_log
      try {
        await supabase.from("simulation_log").insert({
          session_id: sessionId,
          year_start: 0, year_end: 0,
          events_generated: 0,
          scope: "repair_relations",
          triggered_by: "admin_manual",
        } as any);
      } catch { /* ignore */ }

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
    ? report.regionsWithoutCountry.length + report.provincesWithoutRegion.length + report.citiesWithoutProvince.length + report.wondersWithoutCity.length + report.orphanedWiki.length
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

      <div className="text-xs text-muted-foreground p-2 bg-muted/20 rounded border">
        <span className="font-semibold">Hierarchie:</span> Stát → Region → Provincie → Město/Entita
      </div>

      {report && (
        <>
          <div className="grid grid-cols-5 gap-2">
            {[
              { label: "Státy", count: report.countries },
              { label: "Regiony", count: report.regions },
              { label: "Provincie", count: report.provinces },
              { label: "Města", count: report.cities },
              { label: "Sirotci", count: report.orphanedWiki.length },
            ].map(s => (
              <div key={s.label} className="text-center p-2 border rounded">
                <p className="text-lg font-bold">{s.count}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>

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
                {report.orphanedWiki.length > 0 && (
                  <IssueRow label="Sirotčí wiki záznamy" items={report.orphanedWiki} icon={<Trash2 className="h-3 w-3" />} />
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

const IssueRow = ({ label, items, icon }: { label: string; items: { id: string; name: string }[]; icon?: React.ReactNode }) => (
  <div className="p-2 rounded border bg-muted/20 text-xs">
    <div className="flex items-center justify-between mb-1">
      <span className="font-semibold flex items-center gap-1">{icon}{label}</span>
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
