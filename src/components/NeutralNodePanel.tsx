import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Coins, Crown, Swords, Flag, Shield, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface NeutralNodePanelProps {
  sessionId: string;
  playerName: string;
  currentTurn?: number;
  node: {
    id: string;
    name: string;
    is_neutral?: boolean | null;
    discovered?: boolean | null;
    culture_key?: string | null;
    profile_key?: string | null;
    autonomy_score?: number | null;
    population?: number | null;
    defense_value?: number | null;
    prosperity_score?: number | null;
    controlled_by?: string | null;
  };
  onChanged?: () => void;
}

interface NodeOutput {
  basket_key: string;
  good_key: string | null;
  quantity: number;
  quality: number;
  exportable_ratio: number;
}

interface InfluenceRow {
  economic_influence: number;
  political_influence: number;
  military_pressure: number;
  resistance: number;
  integration_progress: number;
}

interface RivalInfluenceRow extends InfluenceRow {
  player_name: string;
}

interface TradeLink {
  link_status: string;
  trade_level: number | null;
}

interface BlockadeRow {
  blocked_by_player: string;
  blocked_until_turn: number;
  reason: string | null;
}

const integrationPressure = (i: InfluenceRow) =>
  i.economic_influence * 0.45 + i.political_influence * 0.35 + i.military_pressure * 0.20;

// Anonymize rival names so multiplayer espionage is fair.
const anonRivalName = (idx: number) => `Rival ${String.fromCharCode(65 + idx)}`;

export default function NeutralNodePanel({ sessionId, playerName, currentTurn, node, onChanged }: NeutralNodePanelProps) {
  const [outputs, setOutputs] = useState<NodeOutput[]>([]);
  const [influence, setInfluence] = useState<InfluenceRow>({
    economic_influence: 0, political_influence: 0, military_pressure: 0, resistance: 50, integration_progress: 0,
  });
  const [link, setLink] = useState<TradeLink | null>(null);
  const [rivals, setRivals] = useState<RivalInfluenceRow[]>([]);
  const [blockade, setBlockade] = useState<BlockadeRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [oRes, iRes, lRes, rRes, bRes] = await Promise.all([
      supabase.from("world_node_outputs").select("basket_key, good_key, quantity, quality, exportable_ratio").eq("node_id", node.id),
      supabase.from("node_influence").select("economic_influence, political_influence, military_pressure, resistance, integration_progress").eq("session_id", sessionId).eq("player_name", playerName).eq("node_id", node.id).maybeSingle(),
      supabase.from("node_trade_links").select("link_status, trade_level").eq("session_id", sessionId).eq("player_name", playerName).eq("node_id", node.id).maybeSingle(),
      supabase.from("node_influence").select("player_name, economic_influence, political_influence, military_pressure, resistance, integration_progress").eq("session_id", sessionId).eq("node_id", node.id).neq("player_name", playerName),
      supabase.from("node_blockades").select("blocked_by_player, blocked_until_turn, reason").eq("session_id", sessionId).eq("node_id", node.id).order("blocked_until_turn", { ascending: false }).limit(1).maybeSingle(),
    ]);
    setOutputs((oRes.data || []) as NodeOutput[]);
    if (iRes.data) setInfluence(iRes.data as InfluenceRow);
    setLink((lRes.data as TradeLink) || null);
    setRivals(((rRes.data as RivalInfluenceRow[]) || []).filter((r) => integrationPressure(r) > 0));
    setBlockade((bRes.data as BlockadeRow) || null);
    setLoading(false);
  }, [node.id, sessionId, playerName]);

  useEffect(() => { load(); }, [load]);

  const dispatch = async (commandType: string, payload: Record<string, unknown> = {}) => {
    setBusy(commandType);
    try {
      const { data, error } = await supabase.functions.invoke("command-dispatch", {
        body: { session_id: sessionId, player_name: playerName, command_type: commandType, payload: { node_id: node.id, ...payload } },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(data?.message || "Akce provedena");
      await load();
      onChanged?.();
    } catch (e) {
      toast.error("Chyba: " + (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (node.controlled_by === playerName && !node.is_neutral) {
    return (
      <div className="p-3 rounded-lg border border-primary/40 bg-primary/5 text-xs">
        <p className="font-display font-semibold mb-1 flex items-center gap-1.5"><Flag className="h-3 w-3" /> Anektováno</p>
        <p className="text-muted-foreground">Tento uzel je pod tvou plnou kontrolou a přispívá plnou produkcí.</p>
      </div>
    );
  }
  if (!node.is_neutral) return null;
  if (!node.discovered) {
    return (
      <div className="p-3 rounded-lg border border-border bg-muted/30 text-xs text-muted-foreground">
        Tento uzel ještě nebyl objeven. Prozkoumej okolní hex.
      </div>
    );
  }

  const pressure = integrationPressure(influence);
  const threshold = influence.resistance + (node.autonomy_score ?? 80) * 0.5;
  const annexAllowed = pressure >= threshold;
  const tradeOpen = link?.link_status === "trade_open" || link?.link_status === "protected" || link?.link_status === "vassalized";

  // Patch 12 — contestation indicator (mirror of engine logic, contestThreshold=0.6)
  const contestLimit = pressure * 0.6;
  const contestants = rivals.filter((r) => integrationPressure(r) >= contestLimit && pressure > 0);
  const contested = contestants.length > 0;
  const topRivalPressure = rivals.reduce((mx, r) => Math.max(mx, integrationPressure(r)), 0);

  // Active blockade?
  const turn = currentTurn ?? 0;
  const blockadeActive = blockade && blockade.blocked_until_turn >= turn;
  const blockedByOther = blockadeActive && blockade.blocked_by_player !== playerName;
  const blockedByMe = blockadeActive && blockade.blocked_by_player === playerName;

  const annexBlocked = !annexAllowed || contested || blockedByOther;

  return (
    <div className="space-y-3">
      {(contested || blockadeActive) && (
        <div className={`p-2 rounded border text-xs flex items-start gap-2 ${blockedByOther ? "border-destructive/40 bg-destructive/5" : "border-amber-500/40 bg-amber-500/5"}`}>
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div className="space-y-0.5">
            {blockedByOther && (
              <p>Anexe je <strong>diplomaticky zablokována</strong> jiným hráčem do tahu {blockade!.blocked_until_turn}.</p>
            )}
            {blockedByMe && (
              <p>Tvá blokáda anexe je aktivní do tahu {blockade!.blocked_until_turn}.</p>
            )}
            {contested && (
              <p>Uzel je <strong>kontestován</strong>: {contestants.length}× rival má tlak ≥ 60 % tvého (nejsilnější: {topRivalPressure.toFixed(1)}).</p>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="p-2 rounded border border-border bg-muted/30">
          <p className="text-muted-foreground">Kultura</p>
          <p className="font-mono">{node.culture_key || "—"}</p>
        </div>
        <div className="p-2 rounded border border-border bg-muted/30">
          <p className="text-muted-foreground">Profil</p>
          <p className="font-mono">{node.profile_key || "—"}</p>
        </div>
        <div className="p-2 rounded border border-border bg-muted/30">
          <p className="text-muted-foreground">Populace</p>
          <p className="font-mono">{node.population ?? "—"}</p>
        </div>
        <div className="p-2 rounded border border-border bg-muted/30">
          <p className="text-muted-foreground">Autonomie</p>
          <p className="font-mono">{node.autonomy_score ?? "—"}</p>
        </div>
      </div>

      <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-1.5">
        <p className="text-xs font-display font-semibold">Produkce</p>
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : outputs.length === 0 ? (
          <p className="text-xs text-muted-foreground">Žádný výstup</p>
        ) : (
          <ul className="space-y-1">
            {outputs.map((o, i) => (
              <li key={i} className="flex justify-between text-xs">
                <span>{o.good_key || o.basket_key}</span>
                <span className="font-mono text-muted-foreground">
                  {Number(o.quantity).toFixed(1)} · q{Number(o.quality).toFixed(1)} · exp {Math.round(Number(o.exportable_ratio) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-2">
        <p className="text-xs font-display font-semibold">Tvůj vliv</p>
        <InfluenceBar label="Ekonomický" value={influence.economic_influence} color="bg-amber-500" />
        <InfluenceBar label="Politický" value={influence.political_influence} color="bg-sky-500" />
        <InfluenceBar label="Vojenský tlak" value={influence.military_pressure} color="bg-rose-500" />
        <div className="grid grid-cols-2 gap-2 text-xs pt-1">
          <div><span className="text-muted-foreground">Odpor:</span> <span className="font-mono">{Math.round(influence.resistance)}</span></div>
          <div><span className="text-muted-foreground">Tlak:</span> <span className="font-mono">{pressure.toFixed(1)} / {threshold.toFixed(1)}</span></div>
        </div>
      </div>

      {rivals.length > 0 && (
        <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-2">
          <p className="text-xs font-display font-semibold flex items-center gap-1.5">
            <Swords className="h-3 w-3" /> Konkurence ({rivals.length})
          </p>
          <ul className="space-y-1.5">
            {rivals
              .map((r) => ({ ...r, p: integrationPressure(r) }))
              .sort((a, b) => b.p - a.p)
              .map((r, idx) => (
                <li key={r.player_name} className="space-y-0.5">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">{anonRivalName(idx)}</span>
                    <span className="font-mono">{r.p.toFixed(1)}</span>
                  </div>
                  <div className="h-1 rounded bg-muted overflow-hidden">
                    <div className="h-full bg-violet-500" style={{ width: `${Math.min(100, r.p)}%` }} />
                  </div>
                </li>
              ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-1.5">
        <Button size="sm" variant={tradeOpen ? "secondary" : "default"} className="text-xs gap-2" disabled={!!busy || tradeOpen} onClick={() => dispatch("OPEN_TRADE_WITH_NODE")}>
          {busy === "OPEN_TRADE_WITH_NODE" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Coins className="h-3 w-3" />}
          {tradeOpen ? `Obchod otevřen (lvl ${link?.trade_level ?? 1})` : "Otevřít obchod"}
        </Button>
        <Button size="sm" variant="secondary" className="text-xs gap-2" disabled={!!busy} onClick={() => dispatch("SEND_ENVOY_TO_NODE")}>
          {busy === "SEND_ENVOY_TO_NODE" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Crown className="h-3 w-3" />}
          Poslat vyslance (+8 polit.)
        </Button>
        <Button size="sm" variant="secondary" className="text-xs gap-2" disabled={!!busy} onClick={() => dispatch("APPLY_MILITARY_PRESSURE")}>
          {busy === "APPLY_MILITARY_PRESSURE" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Swords className="h-3 w-3" />}
          Vojenský tlak (+10 / +odpor)
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-xs gap-2"
          disabled={!!busy || blockedByMe}
          onClick={() => dispatch("BLOCK_NODE_ANNEXATION", { duration_turns: 3, reason: "Diplomatický blok" })}
        >
          {busy === "BLOCK_NODE_ANNEXATION" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Shield className="h-3 w-3" />}
          {blockedByMe ? `Blok aktivní do t. ${blockade!.blocked_until_turn}` : "Diplomaticky zablokovat anexi (3 tahy)"}
        </Button>
        <Button size="sm" variant="destructive" className="text-xs gap-2" disabled={!!busy || annexBlocked} onClick={() => dispatch("ANNEX_NODE")}>
          {busy === "ANNEX_NODE" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Flag className="h-3 w-3" />}
          Anektovat
        </Button>
        {annexBlocked && (
          <p className="text-[10px] text-muted-foreground italic">
            {blockedByOther
              ? `Anexe blokována do tahu ${blockade!.blocked_until_turn}.`
              : contested
              ? `Anexe kontestována (${contestants.length}× rival ≥ 60 % tvého tlaku).`
              : `Chybí ${(threshold - pressure).toFixed(1)} bodů integračního tlaku.`}
          </p>
        )}
      </div>
    </div>
  );
}

function InfluenceBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono">{value.toFixed(1)}</span>
      </div>
      <div className="h-1.5 rounded bg-muted overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
