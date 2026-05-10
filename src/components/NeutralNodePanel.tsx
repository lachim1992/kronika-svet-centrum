import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Coins, Crown, Swords, Flag, Shield, AlertTriangle, Eye, Network, Hammer, Handshake, Link2, ShieldCheck, Anchor } from "lucide-react";
import { toast } from "sonner";
import { emitFocusBuild } from "@/lib/worldMapBus";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

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
    hex_q?: number | null;
    hex_r?: number | null;
    trade_system_id?: string | null;
  };
  onChanged?: () => void;
}

interface NodeOutput { basket_key: string; good_key: string | null; quantity: number; quality: number; exportable_ratio: number; }
interface InfluenceRow { economic_influence: number; political_influence: number; military_pressure: number; resistance: number; integration_progress: number; }
interface RivalInfluenceRow extends InfluenceRow { player_name: string; }
interface TradeLink { link_status: string; trade_level: number | null; }
interface BlockadeRow { blocked_by_player: string; blocked_until_turn: number; reason: string | null; }
interface SystemInfo {
  id: string;
  system_key: string;
  node_count: number;
  route_count: number;
  total_capacity: number;
  member_players: string[];
  my_access?: { access_level: string; tariff_factor: number; access_source: string } | null;
}

const integrationPressure = (i: InfluenceRow) =>
  i.economic_influence * 0.45 + i.political_influence * 0.35 + i.military_pressure * 0.20;
const anonRivalName = (idx: number) => `Rival ${String.fromCharCode(65 + idx)}`;

export default function NeutralNodePanel({ sessionId, playerName, currentTurn, node, onChanged }: NeutralNodePanelProps) {
  const [outputs, setOutputs] = useState<NodeOutput[]>([]);
  const [influence, setInfluence] = useState<InfluenceRow>({
    economic_influence: 0, political_influence: 0, military_pressure: 0, resistance: 50, integration_progress: 0,
  });
  const [link, setLink] = useState<TradeLink | null>(null);
  const [rivals, setRivals] = useState<RivalInfluenceRow[]>([]);
  const [blockade, setBlockade] = useState<BlockadeRow | null>(null);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [mySystems, setMySystems] = useState<Array<{ id: string; system_key: string; node_count: number; hasRoute: boolean }>>([]);
  const [loadingSystems, setLoadingSystems] = useState(false);

  const isMine = !!node.controlled_by && node.controlled_by === playerName;
  const isForeign = !!node.controlled_by && node.controlled_by !== playerName && !node.is_neutral;
  const isNeutral = !!node.is_neutral;

  const load = useCallback(async () => {
    setLoading(true);
    const tasks: Promise<any>[] = [
      Promise.resolve(supabase.from("world_node_outputs").select("basket_key, good_key, quantity, quality, exportable_ratio").eq("node_id", node.id)),
    ];
    if (isNeutral) {
      tasks.push(
        Promise.resolve(supabase.from("node_influence").select("economic_influence, political_influence, military_pressure, resistance, integration_progress").eq("session_id", sessionId).eq("player_name", playerName).eq("node_id", node.id).maybeSingle()),
        Promise.resolve(supabase.from("node_trade_links").select("link_status, trade_level").eq("session_id", sessionId).eq("player_name", playerName).eq("node_id", node.id).maybeSingle()),
        Promise.resolve(supabase.from("node_influence").select("player_name, economic_influence, political_influence, military_pressure, resistance, integration_progress").eq("session_id", sessionId).eq("node_id", node.id).neq("player_name", playerName)),
        Promise.resolve(supabase.from("node_blockades").select("blocked_by_player, blocked_until_turn, reason").eq("session_id", sessionId).eq("node_id", node.id).order("blocked_until_turn", { ascending: false }).limit(1).maybeSingle()),
      );
    }
    const results = await Promise.all(tasks);
    setOutputs((results[0]?.data || []) as NodeOutput[]);
    if (isNeutral) {
      const [, iRes, lRes, rRes, bRes] = results;
      if (iRes?.data) setInfluence(iRes.data as InfluenceRow);
      setLink((lRes?.data as TradeLink) || null);
      setRivals(((rRes?.data as RivalInfluenceRow[]) || []).filter((r) => integrationPressure(r) > 0));
      setBlockade((bRes?.data as BlockadeRow) || null);
    }

    // Trade system membership (always)
    if (node.trade_system_id) {
      const [sysRes, accessRes] = await Promise.all([
        supabase.from("trade_systems").select("id, system_key, node_count, route_count, total_capacity, member_players").eq("id", node.trade_system_id).maybeSingle(),
        supabase.from("player_trade_system_access").select("access_level, tariff_factor, access_source").eq("session_id", sessionId).eq("player_name", playerName).eq("trade_system_id", node.trade_system_id).maybeSingle(),
      ]);
      if (sysRes.data) setSystem({ ...(sysRes.data as any), my_access: (accessRes.data as any) ?? null });
      else setSystem(null);
    } else setSystem(null);

    setLoading(false);
  }, [node.id, node.trade_system_id, sessionId, playerName, isNeutral]);

  useEffect(() => { load(); }, [load]);

  const dispatch = async (commandType: string, payload: Record<string, unknown> = {}) => {
    setBusy(commandType);
    try {
      const { dispatchCommand } = await import("@/lib/commands");
      const res = await dispatchCommand({
        sessionId,
        actor: { name: playerName, type: "player" },
        commandType,
        commandPayload: { node_id: node.id, ...payload },
      });
      if (!res.ok) throw new Error(res.error || "Unknown");
      toast.success("Akce provedena");
      // Refresh trade flow particles immediately for visual feedback
      if (["OPEN_TRADE_WITH_NODE", "ESTABLISH_PROTECTORATE", "VASSALIZE_NODE", "JOIN_TRADE_SYSTEM"].includes(commandType)) {
        supabase.functions.invoke("compute-trade-flows", { body: { session_id: sessionId } })
          .then(() => onChanged?.())
          .catch(() => { /* non-blocking */ });
      }
      await load();
      onChanged?.();
    } catch (e) {
      toast.error("Chyba: " + (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const explore = async () => {
    if (node.hex_q == null || node.hex_r == null) { toast.error("Neznámá pozice uzlu"); return; }
    setBusy("EXPLORE");
    try {
      const { error } = await supabase.functions.invoke("explore-hex", {
        body: { session_id: sessionId, player_name: playerName, q: node.hex_q, r: node.hex_r },
      });
      if (error) throw error;
      toast.success("Hex prozkoumán");
      await load();
      onChanged?.();
    } catch (e) {
      toast.error("Chyba: " + (e as Error).message);
    } finally { setBusy(null); }
  };

  const proposeTreaty = async (treatyType: string) => {
    if (!node.controlled_by) return;
    setBusy("PROPOSE_TREATY:" + treatyType);
    try {
      const { dispatchCommand } = await import("@/lib/commands");
      const res = await dispatchCommand({
        sessionId,
        actor: { name: playerName, type: "player" },
        commandType: "PROPOSE_TREATY",
        commandPayload: { treatyType, partner: node.controlled_by, tariffFactor: 1.1 },
      });
      if (!res.ok) throw new Error(res.error || "Unknown");
      toast.success(`Návrh smlouvy (${treatyType}) odeslán hráči ${node.controlled_by}`);
    } catch (e) {
      toast.error("Chyba: " + (e as Error).message);
    } finally { setBusy(null); }
  };

  // ─── Trade System block (always shown when applicable) ─────────────────
  const TradeSystemBlock = system ? (
    <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-2">
      <p className="text-xs font-display font-semibold flex items-center gap-1.5">
        <Network className="h-3 w-3" /> Obchodní systém #{system.system_key.slice(0, 6)}
      </p>
      <div className="grid grid-cols-3 gap-2 text-[10px]">
        <div><span className="text-muted-foreground">Uzly:</span> <span className="font-mono">{system.node_count}</span></div>
        <div><span className="text-muted-foreground">Cesty:</span> <span className="font-mono">{system.route_count}</span></div>
        <div><span className="text-muted-foreground">Kapac.:</span> <span className="font-mono">{Number(system.total_capacity).toFixed(1)}</span></div>
      </div>
      {system.member_players.length > 0 && (
        <div className="text-[10px]">
          <span className="text-muted-foreground">Členové: </span>
          <span className="font-mono">{system.member_players.join(", ")}</span>
        </div>
      )}
      <div className="text-[10px]">
        <span className="text-muted-foreground">Tvůj přístup: </span>
        {system.my_access ? (
          <span className="font-mono">
            {system.my_access.access_level} · tarif ×{Number(system.my_access.tariff_factor).toFixed(2)}
            <span className="text-muted-foreground"> ({system.my_access.access_source})</span>
          </span>
        ) : (
          <span className="text-amber-500 font-mono">žádný — postav cestu nebo uzavři smlouvu</span>
        )}
      </div>
    </div>
  ) : (
    <div className="p-3 rounded-lg border border-dashed border-border bg-muted/10 text-[11px] text-muted-foreground">
      <p className="flex items-center gap-1.5"><Network className="h-3 w-3" /> Tento uzel zatím nepatří do žádného obchodního systému.</p>
      <p className="mt-1">Postav k němu kompletní cestu, abys ho zařadil/a do sítě.</p>
    </div>
  );

  const openJoinDialog = async () => {
    setJoinDialogOpen(true);
    setLoadingSystems(true);
    try {
      const { data: sys } = await supabase
        .from("trade_systems")
        .select("id, system_key, node_count, member_players")
        .eq("session_id", sessionId);
      const mine = (sys || []).filter((s: any) => (s.member_players || []).includes(playerName));
      const enriched = await Promise.all(mine.map(async (s: any) => {
        const { data: nodes } = await supabase.from("province_nodes").select("id").eq("session_id", sessionId).eq("trade_system_id", s.id);
        const ids = (nodes || []).map((n: any) => n.id);
        let hasRoute = false;
        if (ids.length > 0) {
          const { data: r } = await supabase.from("province_routes")
            .select("id").eq("session_id", sessionId)
            .or(`and(node_a.eq.${node.id},node_b.in.(${ids.join(",")})),and(node_b.eq.${node.id},node_a.in.(${ids.join(",")}))`)
            .limit(1);
          hasRoute = (r || []).length > 0;
        }
        return { id: s.id, system_key: s.system_key, node_count: s.node_count, hasRoute };
      }));
      setMySystems(enriched);
    } finally { setLoadingSystems(false); }
  };

  const BuildRouteButton = (node.hex_q != null && node.hex_r != null) && (
    <Button size="sm" variant="outline" className="w-full text-xs gap-2" onClick={() => { emitFocusBuild(node.id); toast.message("Vyber cílový hex pro cestu"); }}>
      <Hammer className="h-3 w-3" /> Postavit cestu odsud
    </Button>
  );

  const JoinSystemButton = !node.trade_system_id && (
    <Button size="sm" variant="outline" className="w-full text-xs gap-2" onClick={openJoinDialog}>
      <Link2 className="h-3 w-3" /> Připojit k obchodnímu systému
    </Button>
  );

  const JoinDialog = (
    <Dialog open={joinDialogOpen} onOpenChange={setJoinDialogOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Připojit „{node.name}" k obchodnímu systému</DialogTitle>
          <DialogDescription>Připojení vyžaduje existující cestu mezi uzlem a alespoň jedním uzlem v daném systému.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {loadingSystems ? <Loader2 className="h-4 w-4 animate-spin" /> : mySystems.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nemáš žádné obchodní systémy.</p>
          ) : mySystems.map((s) => (
            <div key={s.id} className="p-2 rounded border border-border bg-muted/20 flex items-center justify-between gap-2">
              <div className="text-xs">
                <p className="font-mono">#{s.system_key.slice(0, 6)}</p>
                <p className="text-muted-foreground">{s.node_count} uzlů · {s.hasRoute ? "✓ cesta existuje" : "✗ chybí cesta"}</p>
              </div>
              {s.hasRoute ? (
                <Button size="sm" disabled={!!busy} onClick={async () => {
                  await dispatch("JOIN_TRADE_SYSTEM", { trade_system_id: s.id });
                  setJoinDialogOpen(false);
                }}>Připojit</Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => { setJoinDialogOpen(false); emitFocusBuild(node.id); toast.message("Vyber uzel ze systému jako cíl cesty"); }}>
                  <Hammer className="h-3 w-3 mr-1" /> Postavit
                </Button>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );

  // ─── Self-owned node ───────────────────────────────────────────────────
  if (isMine && !isNeutral) {
    return (
      <div className="space-y-3">
        <div className="p-3 rounded-lg border border-primary/40 bg-primary/5 text-xs">
          <p className="font-display font-semibold mb-1 flex items-center gap-1.5"><Flag className="h-3 w-3" /> Anektováno</p>
          <p className="text-muted-foreground">Tento uzel je pod tvou plnou kontrolou a přispívá plnou produkcí.</p>
        </div>
        {TradeSystemBlock}
        {BuildRouteButton}
      </div>
    );
  }

  // ─── Foreign player-owned node ─────────────────────────────────────────
  if (isForeign) {
    return (
      <div className="space-y-3">
        <div className="p-3 rounded-lg border border-border bg-muted/30 text-xs space-y-1">
          <p className="font-display font-semibold">Cizí uzel — {node.controlled_by}</p>
          <p className="text-muted-foreground">Pro obchod musíte mít smlouvu nebo společný obchodní systém.</p>
        </div>
        {TradeSystemBlock}
        <div className="grid grid-cols-1 gap-1.5">
          <Button size="sm" variant="default" className="text-xs gap-2" disabled={!!busy}
            onClick={() => proposeTreaty("trade_access")}>
            {busy === "PROPOSE_TREATY:trade_access" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Handshake className="h-3 w-3" />}
            Navrhnout obchodní přístup (×1.1 tarif)
          </Button>
          <Button size="sm" variant="secondary" className="text-xs gap-2" disabled={!!busy}
            onClick={() => proposeTreaty("open_borders")}>
            {busy === "PROPOSE_TREATY:open_borders" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Handshake className="h-3 w-3" />}
            Navrhnout otevřené hranice (×1.0)
          </Button>
          {BuildRouteButton}
        </div>
      </div>
    );
  }

  // ─── Neutral node, undiscovered ────────────────────────────────────────
  if (isNeutral && !node.discovered) {
    return (
      <div className="space-y-3">
        <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-500/5 text-xs space-y-1">
          <p className="font-display font-semibold flex items-center gap-1.5"><Eye className="h-3 w-3" /> Neprozkoumáno</p>
          <p className="text-muted-foreground">O tomto uzlu zatím víš jen velmi málo. Prozkoumej hex pro plné informace.</p>
        </div>
        <Button size="sm" className="w-full text-xs gap-2" disabled={!!busy} onClick={explore}>
          {busy === "EXPLORE" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
          Prozkoumat ({node.hex_q}, {node.hex_r})
        </Button>
        {TradeSystemBlock}
        {BuildRouteButton}
      </div>
    );
  }

  // ─── Neutral discovered — full panel (original behavior) ───────────────
  if (!isNeutral) {
    // Unowned, non-neutral — minimal
    return <div className="space-y-3">{TradeSystemBlock}{BuildRouteButton}</div>;
  }

  const pressure = integrationPressure(influence);
  const threshold = influence.resistance + (node.autonomy_score ?? 80) * 0.5;
  const annexAllowed = pressure >= threshold;
  const tradeOpen = link?.link_status === "trade_open" || link?.link_status === "protected" || link?.link_status === "vassalized";

  const contestLimit = pressure * 0.6;
  const contestants = rivals.filter((r) => integrationPressure(r) >= contestLimit && pressure > 0);
  const contested = contestants.length > 0;
  const topRivalPressure = rivals.reduce((mx, r) => Math.max(mx, integrationPressure(r)), 0);

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
            {blockedByOther && <p>Anexe je <strong>diplomaticky zablokována</strong> jiným hráčem do tahu {blockade!.blocked_until_turn}.</p>}
            {blockedByMe && <p>Tvá blokáda anexe je aktivní do tahu {blockade!.blocked_until_turn}.</p>}
            {contested && <p>Uzel je <strong>kontestován</strong>: {contestants.length}× rival má tlak ≥ 60 % tvého (nejsilnější: {topRivalPressure.toFixed(1)}).</p>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="p-2 rounded border border-border bg-muted/30"><p className="text-muted-foreground">Kultura</p><p className="font-mono">{node.culture_key || "—"}</p></div>
        <div className="p-2 rounded border border-border bg-muted/30"><p className="text-muted-foreground">Profil</p><p className="font-mono">{node.profile_key || "—"}</p></div>
        <div className="p-2 rounded border border-border bg-muted/30"><p className="text-muted-foreground">Populace</p><p className="font-mono">{node.population ?? "—"}</p></div>
        <div className="p-2 rounded border border-border bg-muted/30"><p className="text-muted-foreground">Autonomie</p><p className="font-mono">{node.autonomy_score ?? "—"}</p></div>
      </div>

      {TradeSystemBlock}

      <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-1.5">
        <p className="text-xs font-display font-semibold">Produkce</p>
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : outputs.length === 0 ? (
          <p className="text-xs text-muted-foreground">Žádný výstup</p>
        ) : (
          <ul className="space-y-1">
            {outputs.map((o, i) => (
              <li key={i} className="flex justify-between text-xs">
                <span>{o.good_key || o.basket_key}</span>
                <span className="font-mono text-muted-foreground">{Number(o.quantity).toFixed(1)} · q{Number(o.quality).toFixed(1)} · exp {Math.round(Number(o.exportable_ratio) * 100)}%</span>
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
          <p className="text-xs font-display font-semibold flex items-center gap-1.5"><Swords className="h-3 w-3" /> Konkurence ({rivals.length})</p>
          <ul className="space-y-1.5">
            {rivals.map((r) => ({ ...r, p: integrationPressure(r) })).sort((a, b) => b.p - a.p).map((r, idx) => (
              <li key={r.player_name} className="space-y-0.5">
                <div className="flex justify-between text-[10px]"><span className="text-muted-foreground">{anonRivalName(idx)}</span><span className="font-mono">{r.p.toFixed(1)}</span></div>
                <div className="h-1 rounded bg-muted overflow-hidden"><div className="h-full bg-violet-500" style={{ width: `${Math.min(100, r.p)}%` }} /></div>
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
          {busy === "SEND_ENVOY_TO_NODE" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Crown className="h-3 w-3" />} Poslat vyslance (+8 polit.)
        </Button>
        <Button size="sm" variant="secondary" className="text-xs gap-2" disabled={!!busy} onClick={() => dispatch("APPLY_MILITARY_PRESSURE")}>
          {busy === "APPLY_MILITARY_PRESSURE" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Swords className="h-3 w-3" />} Vojenský tlak (+10 / +odpor)
        </Button>
        <Button size="sm" variant="outline" className="text-xs gap-2" disabled={!!busy || blockedByMe}
          onClick={() => dispatch("BLOCK_NODE_ANNEXATION", { duration_turns: 3, reason: "Diplomatický blok" })}>
          {busy === "BLOCK_NODE_ANNEXATION" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Shield className="h-3 w-3" />}
          {blockedByMe ? `Blok aktivní do t. ${blockade!.blocked_until_turn}` : "Diplomaticky zablokovat anexi (3 tahy)"}
        </Button>
        <Button size="sm" variant="destructive" className="text-xs gap-2" disabled={!!busy || annexBlocked} onClick={() => dispatch("ANNEX_NODE")}>
          {busy === "ANNEX_NODE" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Flag className="h-3 w-3" />} Anektovat
        </Button>
        {BuildRouteButton}
        {annexBlocked && (
          <p className="text-[10px] text-muted-foreground italic">
            {blockedByOther ? `Anexe blokována do tahu ${blockade!.blocked_until_turn}.`
              : contested ? `Anexe kontestována (${contestants.length}× rival ≥ 60 % tvého tlaku).`
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
      <div className="flex justify-between text-[10px] text-muted-foreground"><span>{label}</span><span className="font-mono">{value.toFixed(1)}</span></div>
      <div className="h-1.5 rounded bg-muted overflow-hidden"><div className={`h-full ${color}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
