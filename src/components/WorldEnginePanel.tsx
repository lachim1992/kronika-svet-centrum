import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Zap, TrendingUp, AlertTriangle, Swords, Handshake, Shield, BarChart3, Crown, Flame, ScrollText, Users } from "lucide-react";

interface Props {
  sessionId: string;
  currentTurn: number;
  currentPlayerName: string;
}

const WorldEnginePanel = ({ sessionId, currentTurn, currentPlayerName }: Props) => {
  const [influence, setInfluence] = useState<any[]>([]);
  const [tensions, setTensions] = useState<any[]>([]);
  const [tickLog, setTickLog] = useState<any | null>(null);

  useEffect(() => {
    const fetch = async () => {
      const [infRes, tenRes, logRes] = await Promise.all([
        supabase.from("civ_influence").select("*")
          .eq("session_id", sessionId).eq("turn_number", currentTurn)
          .order("total_influence", { ascending: false }),
        supabase.from("civ_tensions").select("*")
          .eq("session_id", sessionId).eq("turn_number", currentTurn)
          .order("total_tension", { ascending: false }),
        supabase.from("world_tick_log").select("*")
          .eq("session_id", sessionId).eq("turn_number", currentTurn)
          .maybeSingle(),
      ]);
      setInfluence(infRes.data || []);
      setTensions(tenRes.data || []);
      setTickLog(logRes.data);
    };
    fetch();
  }, [sessionId, currentTurn]);

  const maxInfluence = Math.max(1, ...influence.map(i => Number(i.total_influence)));
  const tickResults = tickLog?.results as any || {};

  return (
    <div className="space-y-6">
      {/* Tick Status */}
      <div className="flex items-center gap-2">
        <Zap className="h-5 w-5 text-primary" />
        <h3 className="font-display font-semibold text-base">World Engine — Rok {currentTurn}</h3>
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
            <span>🏘️ Města rostla: {tickResults.settlement_growth?.length || 0}</span>
            <span>⚖️ Zákony aplikovány: {tickResults.laws_applied?.length || 0}</span>
            <span>📜 Smlouvy ohroženy: {tickResults.treaty_stability?.filter((t: any) => t.strained || t.broken)?.length || 0}</span>
            <span>🔥 Vzpoury: {tickResults.rebellions?.filter((r: any) => r.rebelled)?.length || 0}</span>
            <span>🏛️ NPC diplomacie: {tickResults.npc_diplomacy?.length || 0}</span>
            <span>⭐ Reputační změny: {tickResults.reputation_changes?.length || 0}</span>
          </div>
        </div>
      )}

      {/* ═══ REBELLIONS ═══ */}
      {(tickResults.rebellions?.length || 0) > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <Flame className="h-4 w-4 text-destructive" />
            <h4 className="font-display font-semibold text-sm">Vzpoury & nepokoje</h4>
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
          </div>
          <div className="space-y-1">
            {tickResults.reputation_changes.map((r: any, idx: number) => (
              <div key={idx} className="game-card p-2 text-xs flex justify-between">
                <span className="font-semibold">{r.player}</span>
                <span className={r.delta > 0 ? "text-green-500" : "text-destructive"}>
                  {r.delta > 0 ? "+" : ""}{r.delta} → {Number(r.newRep).toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ═══ NPC DIPLOMACY ═══ */}
      {(tickResults.npc_diplomacy?.length || 0) > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-primary" />
            <h4 className="font-display font-semibold text-sm">NPC Diplomacie</h4>
          </div>
          <div className="space-y-1">
            {tickResults.npc_diplomacy.map((n: any, idx: number) => (
              <div key={idx} className="game-card p-2 text-xs flex justify-between">
                <span className="font-semibold">{n.cityState}</span>
                <span className="text-muted-foreground">Vliv drift: +{n.drift} • Nálada: {n.mood}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ═══ INFLUENCE LEADERBOARD ═══ */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Crown className="h-4 w-4 text-primary" />
          <h4 className="font-display font-semibold text-sm">Vliv civilizací</h4>
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
                  <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><Swords className="h-3 w-3" />Vojenský: {Math.round(Number(inf.military_score))}</span>
                    <span className="flex items-center gap-1"><BarChart3 className="h-3 w-3" />Obchod: {Math.round(Number(inf.trade_score))}</span>
                    <span className="flex items-center gap-1"><Handshake className="h-3 w-3" />Diplomacie: {Math.round(Number(inf.diplomatic_score))}</span>
                    <span className="flex items-center gap-1"><Shield className="h-3 w-3" />Území: {Math.round(Number(inf.territorial_score))}</span>
                    <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" />Zákony: {Number(inf.law_stability_score).toFixed(1)}</span>
                    <span className="flex items-center gap-1"><Crown className="h-3 w-3" />Reputace: {Number(inf.reputation_score).toFixed(1)}</span>
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
                    <span>Hranice: {Math.round(Number(t.border_proximity))}</span>
                    <span>Vojsko: {Number(t.military_diff).toFixed(1)}</span>
                    <span>Smlouvy: {Math.round(Number(t.broken_treaties))}</span>
                    <span>Embargo: {Math.round(Number(t.trade_embargo))}</span>
                  </div>
                  <div className="flex gap-2 mt-2">
                    {t.crisis_triggered && <Badge variant="destructive" className="text-[9px]">⚠️ Krize</Badge>}
                    {t.war_roll_triggered && (
                      <Badge variant="destructive" className="text-[9px]">
                        🎲 Válečný hod: {t.war_roll_result !== null ? `${Math.round(Number(t.war_roll_result) * 100)}%` : "—"}
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

export default WorldEnginePanel;