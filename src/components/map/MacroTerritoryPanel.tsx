import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { dispatchCommand } from "@/lib/commands";
import { DEPOSIT_LABEL, macroClaimCost, SURVEY_COST, type DepositKind } from "../../../supabase/functions/_shared/geology";

export type MacroSurveySnapshot = { level: number; findings: Finding[] };
interface Props { sessionId: string; playerName: string; currentTurn: number; gridX: number; gridY: number;
  owner: string | null; provinceId: string | null; passable: boolean; biome: string; ownedTiles: number; adjacentOwned: boolean;
  hasCity: boolean; assignableProvinceIds: string[];
  onChanged: () => void | Promise<void>; onSurveyChange?: (survey: MacroSurveySnapshot | null) => void }
type Finding = { kind: DepositKind; hint?: boolean; grade?: number; reserve?: number | null; implemented?: boolean; tag?: string; regenerates?: boolean };

/** Macro tile: per-player survey knowledge, claim and province assignment. Inspect only — nothing happens without a click. */
export default function MacroTerritoryPanel(p: Props) {
  const [survey, setSurvey] = useState<{ level: number; findings: Finding[] } | null>(null);
  const [provinces, setProvinces] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [rural, setRural] = useState<{rural_population:number;carrying_capacity:number;mobile_population:number}|null>(null);
  const [rename, setRename] = useState("");
  const load = useCallback(async () => {
    const [{ data: s }, { data: pr }, {data: population}] = await Promise.all([
      supabase.from("macro_surveys").select("level, findings").eq("session_id", p.sessionId).eq("player_name", p.playerName).eq("grid_x", p.gridX).eq("grid_y", p.gridY).maybeSingle(),
      supabase.from("provinces").select("id, name").eq("session_id", p.sessionId).eq("owner_player", p.playerName),
      supabase.from("hex_population").select("rural_population,carrying_capacity,mobile_population").eq("session_id",p.sessionId).eq("q",p.gridX).eq("r",p.gridY).maybeSingle(),
    ]);
    const next = s ? { level: s.level, findings: (s.findings as unknown as Finding[]) || [] } : null;
    setRural(population);
    setSurvey(next);
    p.onSurveyChange?.(next);
    setProvinces(pr || []);
  }, [p.sessionId, p.playerName, p.gridX, p.gridY, p.onSurveyChange]);
  useEffect(() => { void load(); }, [load]);

  const run = async (key: string, commandType: string, payload: Record<string, unknown>, ok: string) => {
    setBusy(key);
    try {
      const r = await dispatchCommand({ sessionId: p.sessionId, turnNumber: p.currentTurn, actor: { name: p.playerName }, commandType, commandPayload: { gridX: p.gridX, gridY: p.gridY, ...payload } });
      if (!r.ok) { toast.error(r.error || "Akce se nezdařila"); return; }
      toast.success(ok); await load(); await p.onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Akci se nepodařilo dokončit");
    } finally {
      setBusy(null);
    }
  };
  const water = /sea|ocean|lake|water/.test(p.biome);
  const level = survey?.level || 0;
  const claimBlock = p.owner === p.playerName ? "Pole už je vaše" : p.owner ? "Pole patří jiné říši" : water || !p.passable ? "Toto pole nelze nárokovat"
    : !level ? "Pole nejdřív prozkoumejte" : !p.adjacentOwned ? "Pole musí sousedit s vaším územím" : null;

  return <section className="mt-4 border border-border/70 bg-muted/20 p-3">
    {rural && <p className="mb-2 text-xs">Venkov: {rural.rural_population.toLocaleString("cs-CZ")} · kapacita {rural.carrying_capacity} · mobilní {rural.mobile_population}</p>}
    <h3 className="text-sm font-medium">Průzkum a území</h3>
    <p className="mt-0.5 text-[10px] text-muted-foreground">{level === 0 ? "Neprozkoumáno" : level === 1 ? "Náznaky surovin" : "Potvrzený průzkum"} · vidíte jen vy</p>
    {survey && <ul className="mt-2 space-y-1 text-xs">
      {survey.findings.length === 0 && <li className="text-muted-foreground">Žádné významné suroviny</li>}
      {survey.findings.map((f, i) => <li key={i} className="flex justify-between gap-2">
        <span>{DEPOSIT_LABEL[f.kind] || f.kind}{f.tag ? ` (${f.tag})` : ""}</span>
        <span className="text-muted-foreground">{f.hint ? "náznak" : `jakost ${f.grade}${f.reserve ? ` · zásoba ${f.reserve}` : f.regenerates ? " · obnovitelné" : ""}${f.implemented ? "" : " · zatím nelze těžit"}`}</span>
      </li>)}
    </ul>}
    <div className="mt-3 flex flex-wrap gap-2">
      {level < 2 && !water && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void run("survey", "SURVEY_MACRO", { level: level + 1 }, "Průzkum dokončen")}>
        {busy === "survey" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}{level ? "Podrobný průzkum" : "Průzkum"} · {SURVEY_COST[(level + 1) as 1 | 2]} zlata</Button>}
      {p.owner !== p.playerName && <Button size="sm" disabled={!!busy || !!claimBlock} title={claimBlock || undefined}
        onClick={() => void run("claim", "CLAIM_MACRO_TILE", {}, "Pole připojeno k říši")}>
        {busy === "claim" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}Nárokovat makropole · {macroClaimCost(p.ownedTiles)} zlata</Button>}
    </div>
    {claimBlock && p.owner !== p.playerName && <p className="mt-1 text-[11px] text-muted-foreground">{claimBlock}</p>}
    {p.owner === p.playerName && provinces.length > 0 && (() => {
      const options = provinces.filter(pr => pr.id === p.provinceId || (!p.hasCity && p.assignableProvinceIds.includes(pr.id)));
      const blockedReason = p.hasCity ? "Pole s městem zůstává ve své provincii."
        : options.some(pr => pr.id !== p.provinceId) ? null : "Do provincie lze přidat jen pole sousedící s jejím územím.";
      return <label className="mt-3 block text-xs">Provincie
        <select className="mt-1 w-full border border-border bg-background p-1 text-xs" value={p.provinceId || ""} disabled={!!busy || !!blockedReason}
          onChange={e => {
            const provinceId = e.target.value;
            if (provinceId === p.provinceId) return;
            if (p.hasCity) { toast.error("Pole s městem nelze přesunout do jiné provincie"); return; }
            if (!p.assignableProvinceIds.includes(provinceId)) { toast.error("Provincie musí být souvislá — pole nesousedí s provincií"); return; }
            void run("prov", "ASSIGN_MACRO_PROVINCE", { provinceId }, "Pole přiděleno provincii");
          }}>
          {!p.provinceId && <option value="">— bez provincie —</option>}
          {options.map(pr => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
        </select>
        {blockedReason && <span className="mt-1 block text-[11px] text-muted-foreground">{blockedReason}</span>}
      </label>;
    })()}
    {p.owner === p.playerName && p.provinceId && provinces.some(pr => pr.id === p.provinceId) && <div className="mt-2 flex gap-1">
      <input className="flex-1 border border-border bg-background p-1 text-xs" maxLength={48} placeholder="Nový název provincie"
        value={rename} onChange={e => setRename(e.target.value)} />
      <Button size="sm" variant="outline" disabled={!!busy || rename.trim().length < 2}
        onClick={() => void run("rename", "RENAME_PROVINCE", { provinceId: p.provinceId, name: rename.trim() }, "Provincie přejmenována").then(() => setRename(""))}>Přejmenovat</Button>
    </div>}
  </section>;
}
