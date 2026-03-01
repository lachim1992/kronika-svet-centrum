import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { InfoTip } from "@/components/ui/info-tip";
import { Zap, TrendingUp, AlertTriangle, Swords, Handshake, Shield, BarChart3, Crown, Flame, ScrollText, Users, Activity, Building2, Route, Bot, ChevronDown, ChevronUp } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Props {
  sessionId: string;
  currentTurn: number;
  currentPlayerName: string;
}

interface CumulativeStats {
  totalBattles: number;
  totalEvents: number;
  totalBuildings: number;
  totalTradeRoutes: number;
  totalDeclarations: number;
  totalChronicleEntries: number;
  totalRumors: number;
  totalAIActions: number;
  totalWars: number;
  totalTreaties: number;
  totalRebellions: number;
  totalCrises: number;
  totalPopulation: number;
  totalCities: number;
  totalArmies: number;
  totalOlympiads: number;
  totalMedals: number;
  totalAcademies: number;
  totalChampions: number;
}

const WorldEnginePanel = ({ sessionId, currentTurn, currentPlayerName }: Props) => {
  const [influence, setInfluence] = useState<any[]>([]);
  const [tensions, setTensions] = useState<any[]>([]);
  const [tickLog, setTickLog] = useState<any | null>(null);
  const [dataTurn, setDataTurn] = useState(0);
  const [cumulativeStats, setCumulativeStats] = useState<CumulativeStats | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const lastTurn = currentTurn - 1;

      const [infRes, tenRes, logCurr, logPrev] = await Promise.all([
        supabase.from("civ_influence").select("*")
          .eq("session_id", sessionId).eq("turn_number", lastTurn)
          .order("total_influence", { ascending: false }),
        supabase.from("civ_tensions").select("*")
          .eq("session_id", sessionId).eq("turn_number", lastTurn)
          .order("total_tension", { ascending: false }),
        supabase.from("world_tick_log").select("*")
          .eq("session_id", sessionId).eq("turn_number", currentTurn)
          .maybeSingle(),
        supabase.from("world_tick_log").select("*")
          .eq("session_id", sessionId).eq("turn_number", lastTurn)
          .maybeSingle(),
      ]);

      const tickData = logCurr.data || logPrev.data;

      if ((infRes.data?.length || 0) === 0 && lastTurn > 1) {
        const { data: olderInf } = await supabase.from("civ_influence").select("*")
          .eq("session_id", sessionId).order("turn_number", { ascending: false }).limit(20);
        const { data: olderTen } = await supabase.from("civ_tensions").select("*")
          .eq("session_id", sessionId).order("turn_number", { ascending: false }).limit(30);

        if (olderInf?.length) {
          const latestTurn = olderInf[0].turn_number;
          setInfluence(olderInf.filter((i: any) => i.turn_number === latestTurn));
          setTensions((olderTen || []).filter((t: any) => t.turn_number === latestTurn));
          setDataTurn(latestTurn);
        } else {
          setInfluence([]);
          setTensions([]);
          setDataTurn(0);
        }
      } else {
        setInfluence(infRes.data || []);
        setTensions(tenRes.data || []);
        setDataTurn(lastTurn);
      }

      setTickLog(tickData);

      // Fetch cumulative stats
      const [
        { count: battleCount },
        { count: eventCount },
        { count: buildingCount },
        { count: tradeRouteCount },
        { count: declarationCount },
        { count: chronicleCount },
        { count: rumorCount },
        { count: aiActionCount },
        { count: warCount },
        { count: treatyCount },
        { count: rebellionCount },
        { count: crisisCount },
        { data: citiesData },
        { count: armyCount },
        { count: olympiadCount },
        { count: medalCount },
        { count: academyCount },
        { data: champData },
      ] = await Promise.all([
        supabase.from("battles").select("id", { count: "exact", head: true }).eq("session_id", sessionId),
        supabase.from("game_events").select("id", { count: "exact", head: true }).eq("session_id", sessionId),
        supabase.from("city_buildings").select("id", { count: "exact", head: true }).eq("session_id", sessionId).eq("status", "completed"),
        supabase.from("trade_routes" as any).select("id", { count: "exact", head: true }).eq("session_id", sessionId),
        supabase.from("declarations").select("id", { count: "exact", head: true }).eq("session_id", sessionId),
        supabase.from("chronicle_entries").select("id", { count: "exact", head: true }).eq("session_id", sessionId),
        supabase.from("city_rumors").select("id", { count: "exact", head: true }).eq("session_id", sessionId),
        supabase.from("world_action_log" as any).select("id", { count: "exact", head: true }).eq("session_id", sessionId).eq("action_type", "ai_faction_turn"),
        supabase.from("war_declarations" as any).select("id", { count: "exact", head: true }).eq("session_id", sessionId),
        supabase.from("game_events").select("id", { count: "exact", head: true }).eq("session_id", sessionId).eq("event_type", "treaty"),
        supabase.from("game_events").select("id", { count: "exact", head: true }).eq("session_id", sessionId).eq("event_type", "rebellion"),
        supabase.from("game_events").select("id", { count: "exact", head: true }).eq("session_id", sessionId).eq("event_type", "crisis"),
        supabase.from("cities").select("population_total").eq("session_id", sessionId).eq("status", "ok"),
        supabase.from("military_stacks" as any).select("id", { count: "exact", head: true }).eq("session_id", sessionId).eq("is_active", true),
        supabase.from("games_festivals").select("id", { count: "exact", head: true }).eq("session_id", sessionId).eq("status", "concluded"),
        supabase.from("games_results").select("id", { count: "exact", head: true }).eq("session_id", sessionId).not("medal", "is", null),
        supabase.from("academies").select("id", { count: "exact", head: true }).eq("session_id", sessionId),
        supabase.from("academies").select("total_champions").eq("session_id", sessionId),
      ]);

      const totalPop = (citiesData || []).reduce((s: number, c: any) => s + (c.population_total || 0), 0);
      const totalChampions = ((champData as any) || []).reduce((s: number, a: any) => s + (a.total_champions || 0), 0);

      setCumulativeStats({
        totalBattles: battleCount || 0,
        totalEvents: eventCount || 0,
        totalBuildings: buildingCount || 0,
        totalTradeRoutes: tradeRouteCount || 0,
        totalDeclarations: declarationCount || 0,
        totalChronicleEntries: chronicleCount || 0,
        totalRumors: rumorCount || 0,
        totalAIActions: aiActionCount || 0,
        totalWars: warCount || 0,
        totalTreaties: treatyCount || 0,
        totalRebellions: rebellionCount || 0,
        totalCrises: crisisCount || 0,
        totalPopulation: totalPop,
        totalCities: (citiesData || []).length,
        totalArmies: armyCount || 0,
        totalOlympiads: olympiadCount || 0,
        totalMedals: medalCount || 0,
        totalAcademies: academyCount || 0,
        totalChampions,
      });
    };
    fetchData();
  }, [sessionId, currentTurn]);

  const maxInfluence = Math.max(1, ...influence.map(i => Number(i.total_influence)));
  const tickResults = tickLog?.results as any || {};

  return (
    <div className="space-y-6">
      {/* Tick Status */}
      <div className="flex items-center gap-2">
        <Zap className="h-5 w-5 text-primary" />
        <h3 className="font-display font-semibold text-base">World Engine — Rok {currentTurn}</h3>
        <InfoTip>
          World Engine automaticky při uzavření kola vyhodnocuje: růst populace, vliv civilizací,
          diplomatické tenze, stabilitu smluv, rebelie a legitimitu. Výsledky ovlivňují celou hru.
        </InfoTip>
        {tickLog && (
          <Badge variant={tickLog.status === "completed" ? "default" : "secondary"} className="text-[10px] ml-auto">
            {tickLog.status === "completed" ? "✅ Tick dokončen" : "⏳ " + tickLog.status}
          </Badge>
        )}
        {!tickLog && (
          <Badge variant="outline" className="text-[10px] ml-auto">Tick ještě neproběhl</Badge>
        )}
      </div>

      {/* ═══ TICK SUMMARY ═══ */}
      {tickLog?.status === "completed" && (
        <div className="game-card p-3 space-y-1">
          <h4 className="font-display font-semibold text-xs text-muted-foreground mb-2">📊 Souhrn ticku</h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span>🏘️ Města rostla: {tickResults.settlement_growth?.length || tickResults.growthCount || 0}</span>
            <span>⚖️ Zákony aplikovány: {tickResults.laws_applied?.length || tickResults.lawEvents?.length || 0}</span>
            <span>📜 Smlouvy ohroženy: {tickResults.treaty_stability?.filter((t: any) => t.strained || t.broken)?.length || 0}</span>
            <span>🔥 Vzpoury: {tickResults.rebellions?.filter((r: any) => r.rebelled)?.length || 0}</span>
            <span>💪 Morálka garnizonů: {tickResults.garrison_morale_boosts?.length || 0}</span>
            <span>⭐ Reputační změny: {tickResults.reputation_changes?.length || 0}</span>
            <span>📡 Emitované události: {tickResults.emittedEventsCount || 0}</span>
            <span>🧬 Trait decay: {tickResults.traitDecay?.length || 0}</span>
          </div>
        </div>
      )}

      {/* ═══ REBELLIONS ═══ */}
      {(tickResults.rebellions?.length || 0) > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <Flame className="h-4 w-4 text-destructive" />
            <h4 className="font-display font-semibold text-sm">Vzpoury & nepokoje</h4>
            <InfoTip>
              Když stabilita města klesne pod 30 %, hrozí vzpoura.
              Pod 15 % je riziko vážné (40 % šance). Vzpoura způsobí ztrátu 10 % populace a -15 stability.
              Rebelie také sníží reputaci vládce o 8 bodů.
            </InfoTip>
          </div>
          <div className="space-y-1">
            {tickResults.rebellions.map((r: any, idx: number) => (
              <div key={idx} className={`game-card p-2 text-xs ${r.rebelled ? "border-destructive/40 bg-destructive/5" : ""}`}>
                <span className="font-semibold">{r.city}</span>
                <span className="text-muted-foreground ml-2">
                  {r.rebelled ? `🔥 Vzpoura! Ztráta ${r.popLoss} obyvatel.` : `⚠️ Nepokoje (stabilita: ${r.stability}%)`}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ═══ TREATY STABILITY ═══ */}
      {(tickResults.treaty_stability?.length || 0) > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <ScrollText className="h-4 w-4 text-primary" />
            <h4 className="font-display font-semibold text-sm">Stabilita smluv</h4>
            <InfoTip>
              Smlouvy a aliance se mohou rozpadnout, pokud tenze mezi stranami překročí 50.
              Při tenzi nad 70 je 70% šance na rozpad. Rozpad sníží reputaci obou stran o 10 bodů
              a vytvoří událost „zrada" v dějinách.
            </InfoTip>
          </div>
          <div className="space-y-1">
            {tickResults.treaty_stability.map((t: any, idx: number) => (
              <div key={idx} className={`game-card p-2 text-xs ${t.broken ? "border-destructive/40 bg-destructive/5" : t.strained ? "border-yellow-500/30 bg-yellow-500/5" : ""}`}>
                <span className="font-semibold">{t.partyA} ⟷ {t.partyB}</span>
                <span className="text-muted-foreground ml-2">
                  Tenze: {Math.round(t.tension)}
                  {t.broken && " — 💔 Smlouva rozpadlá!"}
                  {t.strained && !t.broken && " — ⚠️ Pod tlakem"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ═══ REPUTATION CHANGES ═══ */}
      {(tickResults.reputation_changes?.length || 0) > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h4 className="font-display font-semibold text-sm">Změny reputace</h4>
            <InfoTip>
              Reputace (-100 až +100) ovlivňuje diplomacii a vliv. Klesá za zrady (-25), války (-15),
              rebelie (-8). Roste za aliance (+10) a smlouvy (+5). Každé kolo se přirozeně rozpadá (×0.9).
              Reputace tvoří 10 % celkového vlivu.
            </InfoTip>
          </div>
          <div className="space-y-1">
            {tickResults.reputation_changes.map((r: any, idx: number) => (
              <div key={idx} className="game-card p-2 text-xs flex justify-between">
                <span className="font-semibold">{r.player}</span>
                <span className={r.delta > 0 ? "text-success" : "text-destructive"}>
                  {r.delta > 0 ? "+" : ""}{r.delta} → {Number(r.newRep).toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ═══ NPC DIPLOMACY ═══ */}
      {(tickResults.npc_diplomacy?.length || tickResults.cityStateUpdates?.length || 0) > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-primary" />
            <h4 className="font-display font-semibold text-sm">NPC Diplomacie</h4>
            <InfoTip>
              Městské státy (NPC) přirozeně gravitují k nejsilnější civilizaci — jejich vliv roste o 2 %
              vlivu nejmocnějšího hráče. Nálada NPC závisí na průměrné tenzi ve světě:
              nad 60 = Nepokojný, nad 30 = Opatrný, jinak Neutrální.
            </InfoTip>
          </div>
          <div className="space-y-1">
            {(tickResults.npc_diplomacy || tickResults.cityStateUpdates || []).map((n: any, idx: number) => (
              <div key={idx} className="game-card p-2 text-xs flex justify-between">
                <span className="font-semibold">{n.cityState || n.id?.substring(0, 8)}</span>
                <span className="text-muted-foreground">
                  {n.drift != null ? `Vliv drift: +${n.drift}` : ""} {n.mood ? `• Nálada: ${n.mood}` : ""}
                  {n.updates?.mood ? `Nálada: ${n.updates.mood}` : ""}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ═══ CUMULATIVE GAME STATISTICS ═══ */}
      {cumulativeStats && (
        <Collapsible open={statsOpen} onOpenChange={setStatsOpen}>
          <CollapsibleTrigger className="w-full">
            <div className="flex items-center gap-2 py-2 cursor-pointer hover:opacity-80">
              <Activity className="h-4 w-4 text-primary" />
              <h4 className="font-display font-semibold text-sm">Statistiky celé hry</h4>
              <InfoTip>Kumulativní přehled všech dat od začátku kampaně — bitvy, události, AI rozhodnutí, budovy, populace.</InfoTip>
              {statsOpen ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="game-card p-3 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatCard icon="⚔️" label="Bitvy" value={cumulativeStats.totalBattles} />
                <StatCard icon="📜" label="Události" value={cumulativeStats.totalEvents} />
                <StatCard icon="🏛️" label="Budovy" value={cumulativeStats.totalBuildings} />
                <StatCard icon="🏙️" label="Města" value={cumulativeStats.totalCities} />
                <StatCard icon="👥" label="Celk. populace" value={cumulativeStats.totalPopulation.toLocaleString()} />
                <StatCard icon="🗡️" label="Armády" value={cumulativeStats.totalArmies} />
                <StatCard icon="🔴" label="Války" value={cumulativeStats.totalWars} />
                <StatCard icon="🤝" label="Smlouvy" value={cumulativeStats.totalTreaties} />
                <StatCard icon="🔥" label="Rebelie" value={cumulativeStats.totalRebellions} />
                <StatCard icon="⚡" label="Krize" value={cumulativeStats.totalCrises} />
                <StatCard icon="📣" label="Vyhlášení" value={cumulativeStats.totalDeclarations} />
                <StatCard icon="📖" label="Kroniky" value={cumulativeStats.totalChronicleEntries} />
                <StatCard icon="💬" label="Zvěsti" value={cumulativeStats.totalRumors} />
                <StatCard icon="🤖" label="AI akce" value={cumulativeStats.totalAIActions} />
                <StatCard icon="🛤️" label="Obch. trasy" value={cumulativeStats.totalTradeRoutes} />
                <StatCard icon="🏟️" label="Olympiády" value={cumulativeStats.totalOlympiads} />
                <StatCard icon="🏅" label="Medaile" value={cumulativeStats.totalMedals} />
                <StatCard icon="🏫" label="Akademie" value={cumulativeStats.totalAcademies} />
                <StatCard icon="🏆" label="Šampioni" value={cumulativeStats.totalChampions} />
              </div>
              <div className="text-[10px] text-muted-foreground pt-1 border-t border-border">
                <p><strong>Mechaniky:</strong></p>
                <p>• <strong>Stabilita</strong>: baseline 60 %, klesá daněmi/válkou, roste reformami. Pod 30 % = rebelie, pod 15 % = 40 % šance.</p>
                <p>• <strong>Vliv</strong>: Vojsko 22 % + Obchod 18 % + Území 18 % + Diplomacie 13 % + Kultura 10 % + Zákony 9 % + Reputace 10 %.</p>
                <p>• <strong>Kultura</strong>: Zlato ×3 + ostatní medaile ×1.5 + hostování ×15 + prům. reputace akademií ×0.3.</p>
                <p>• <strong>Tenze</strong>: Hranice ×15 + Vojsko ×0.1 + Smlouvy ×20 + Embarga ×15. Prahy: ≥65 krize, ≥88 válka.</p>
                <p>• <strong>Reputace</strong>: Decay ×0.9/kolo. Aliance +10, zrada -25, válka -15, rebelie -8. Hostitel her +8, šampion +5.</p>
                <p>• <strong>Akademie</strong>: Reputace školy dává hybridní bonus +1-5 % ke skóre atletů v soutěžích.</p>
                <p>• <strong>Fan base → Morálka</strong>: Fan base akademií boostuje morálku garnizonů ve městech hráče (+1 až +5 dle fan_base/20).</p>
                <p>• <strong>Hostitelské město</strong>: Připravené město (dev + stab/10 ≥ 12): +5 stabilita, +15 vliv. Nepřipravené: -5 až -15 stabilita, riziko nepokojů.</p>
                <p>• <strong>AI frakce</strong>: Plně autonomní — obchodují, uzavírají pakty, útočí i mezi sebou.</p>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* ═══ INFLUENCE LEADERBOARD ═══ */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Crown className="h-4 w-4 text-primary" />
          <h4 className="font-display font-semibold text-sm">Vliv civilizací</h4>
          <InfoTip side="right">
            <div className="space-y-1">
              <p className="font-semibold">Celkový vliv = vážený součet 7 složek:</p>
              <p>⚔️ Vojenský (22 %) — síla armádních stacků</p>
              <p>📊 Obchod (18 %) — počet měšťanů ve městech</p>
              <p>🤝 Diplomacie (13 %) — smlouvy a aliance (×10 bodů)</p>
              <p>🛡️ Území (18 %) — provincie (×20) + města (×10)</p>
              <p>🏟️ Kultura (10 %) — medaile, hostování her, reputace akademií</p>
              <p>⚖️ Zákony (9 %) — aktivní zákony (×5) + prům. stabilita</p>
              <p>👑 Reputace (10 %) — historická pověst (decay ×0.9/kolo)</p>
              <p className="text-muted-foreground mt-1">Vliv ovlivňuje: gravitaci NPC městských států, AI rozhodování, diplomatické páky a komu se NPC přikloní.</p>
            </div>
          </InfoTip>
          {dataTurn > 0 && (
            <span className="text-[10px] text-muted-foreground ml-auto">data z kola {dataTurn}</span>
          )}
        </div>
        {influence.length === 0 ? (
          <p className="text-sm text-muted-foreground italic text-center py-4">Data vlivu budou dostupná po prvním uzavření kola.</p>
        ) : (
          <div className="space-y-2">
            {influence.map((inf, idx) => {
              const pct = Math.round((Number(inf.total_influence) / maxInfluence) * 100);
              const isMe = inf.player_name === currentPlayerName;
              return (
                <div key={inf.id} className={`game-card p-3 ${isMe ? "border-primary/30" : ""}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-muted-foreground w-5">#{idx + 1}</span>
                      <span className={`font-display font-semibold text-sm ${isMe ? "text-primary" : ""}`}>{inf.player_name}</span>
                    </div>
                    <span className="font-display font-bold text-lg">{Math.round(Number(inf.total_influence))}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden mb-2">
                    <div className="h-full bg-primary/70 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                    <div className="grid grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Swords className="h-3 w-3" />Vojenský: {Math.round(Number(inf.military_score))}
                      <InfoTip>Součet síly (power) všech aktivních armádních stacků. Váha: 22 %.</InfoTip>
                    </span>
                    <span className="flex items-center gap-1">
                      <BarChart3 className="h-3 w-3" />Obchod: {Math.round(Number(inf.trade_score))}
                      <InfoTip>Součet měšťanů (burghers) ve všech městech. Váha: 18 %.</InfoTip>
                    </span>
                    <span className="flex items-center gap-1">
                      <Handshake className="h-3 w-3" />Diplomacie: {Math.round(Number(inf.diplomatic_score))}
                      <InfoTip>Počet diplomatických událostí (smlouvy, aliance) × 10 bodů. Váha: 13 %.</InfoTip>
                    </span>
                    <span className="flex items-center gap-1">
                      <Shield className="h-3 w-3" />Území: {Math.round(Number(inf.territorial_score))}
                      <InfoTip>Provincie × 20 + města × 10 bodů. Váha: 18 %.</InfoTip>
                    </span>
                    <span className="flex items-center gap-1">
                      <Activity className="h-3 w-3" />Kultura: {Number(inf.cultural_score || 0).toFixed(1)}
                      <InfoTip>Medaile (🥇×3 + ostatní ×1.5) + hostování her (×15) + prům. reputace akademií (×0.3). Váha: 10 %.</InfoTip>
                    </span>
                    <span className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />Zákony: {Number(inf.law_stability_score).toFixed(1)}
                      <InfoTip>Aktivní zákony × 5 + průměrná stabilita měst × 0.5. Váha: 9 %.</InfoTip>
                    </span>
                    <span className="flex items-center gap-1">
                      <Crown className="h-3 w-3" />Reputace: {Number(inf.reputation_score).toFixed(1)}
                      <InfoTip>Historická pověst (-100 až +100). Decay ×0.9/kolo. Hostitel her +8, šampion +5. Váha: 10 %.</InfoTip>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ═══ TENSION MAP ═══ */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="h-4 w-4 text-primary" />
          <h4 className="font-display font-semibold text-sm">Diplomatická tenze</h4>
          <InfoTip side="right">
            <div className="space-y-1">
              <p className="font-semibold">Tenze = součet 4 faktorů mezi párem civilizací:</p>
              <p>🗺️ Hranice — sdílené provincie × 15 + menší strana × 2</p>
              <p>⚔️ Vojsko — rozdíl vojenské síly × 0.1</p>
              <p>📜 Smlouvy — porušené smlouvy × 20</p>
              <p>🚫 Embargo — aktivní embarga × 15</p>
              <p className="text-muted-foreground mt-1">Prahy: ≥ 65 = diplomatická krize, ≥ 88 = hod na válku.</p>
              <p className="text-muted-foreground">Tenze ovlivňuje: rozpad smluv, náladu NPC, generování krizí a válek, reputaci.</p>
            </div>
          </InfoTip>
          {dataTurn > 0 && (
            <span className="text-[10px] text-muted-foreground ml-auto">data z kola {dataTurn}</span>
          )}
        </div>
        {tensions.length === 0 ? (
          <p className="text-sm text-muted-foreground italic text-center py-4">Data tenze budou dostupná po prvním uzavření kola.</p>
        ) : (
          <div className="space-y-2">
            {tensions.map(t => {
              const level = Number(t.total_tension);
              const color = level >= 85 ? "text-destructive" : level >= 60 ? "text-yellow-500" : "text-muted-foreground";
              const bgColor = level >= 85 ? "border-destructive/40 bg-destructive/5" : level >= 60 ? "border-yellow-500/30 bg-yellow-500/5" : "";
              return (
                <div key={t.id} className={`game-card p-3 ${bgColor}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-display font-semibold text-sm">{t.player_a} ⟷ {t.player_b}</span>
                    <span className={`font-display font-bold text-lg ${color}`}>{Math.round(level)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden mb-2">
                    <div
                      className={`h-full rounded-full transition-all ${level >= 85 ? "bg-destructive" : level >= 60 ? "bg-yellow-500" : "bg-muted-foreground/40"}`}
                      style={{ width: `${Math.min(100, level)}%` }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-0.5">
                      Hranice: {Math.round(Number(t.border_proximity))}
                      <InfoTip>Sdílené provincie × 15 + menší strana × 2.</InfoTip>
                    </span>
                    <span className="flex items-center gap-0.5">
                      Vojsko: {Number(t.military_diff).toFixed(1)}
                      <InfoTip>Absolutní rozdíl vojenské síly × 0.1. Velká nerovnováha zvyšuje tenzi.</InfoTip>
                    </span>
                    <span className="flex items-center gap-0.5">
                      Smlouvy: {Math.round(Number(t.broken_treaties))}
                      <InfoTip>Počet porušených smluv × 20. Zrady vytvářejí dlouhodobou tenzi.</InfoTip>
                    </span>
                    <span className="flex items-center gap-0.5">
                      Embargo: {Math.round(Number(t.trade_embargo))}
                      <InfoTip>Aktivní obchodní embarga × 15. Vydáváno přes prohlášení.</InfoTip>
                    </span>
                  </div>
                  <div className="flex gap-2 mt-2">
                    {t.crisis_triggered && (
                      <Badge variant="destructive" className="text-[9px]">
                        ⚠️ Krize
                        <InfoTip className="ml-0.5">Tenze ≥ 65. Oba hráči ztrácejí -5 reputace. Krize je zanesena do dějin.</InfoTip>
                      </Badge>
                    )}
                    {t.war_roll_triggered && (
                      <Badge variant="destructive" className="text-[9px]">
                        🎲 Válečný hod: {t.war_roll_result !== null ? `${Math.round(Number(t.war_roll_result) * 100)}%` : "—"}
                        <InfoTip className="ml-0.5">Tenze ≥ 88 spustí deterministický hod. Pokud výsledek {">"} 70 %, propukne válka. Agresor -15 rep, obránce -10 rep.</InfoTip>
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

function StatCard({ icon, label, value }: { icon: string; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-2 bg-muted/30 rounded-md p-2">
      <span className="text-sm">{icon}</span>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-display font-bold text-sm">{value}</div>
      </div>
    </div>
  );
}

export default WorldEnginePanel;
