/**
 * TradeSystemsOverlay — Stage 8
 *
 * Renders a coloured halo around each province_node grouped by its
 * trade_system_id (computed by edge function compute-trade-systems).
 *
 * Helps players see which nodes share the same connected trade system.
 */
import { memo, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const HEX_SIZE = 38;
const SQRT3 = Math.sqrt(3);
function hexToPixel(q: number, r: number) {
  return { x: HEX_SIZE * (SQRT3 * q + (SQRT3 / 2) * r), y: HEX_SIZE * 1.5 * r };
}

const SYSTEM_COLORS = [
  "hsl(220, 85%, 60%)", "hsl(160, 70%, 50%)", "hsl(35, 90%, 55%)",
  "hsl(0, 80%, 60%)", "hsl(280, 65%, 60%)", "hsl(190, 80%, 50%)",
  "hsl(95, 60%, 50%)", "hsl(330, 75%, 60%)",
];

interface NodeRow {
  id: string;
  hex_q: number;
  hex_r: number;
  trade_system_id: string | null;
}

interface Props {
  sessionId: string;
  offsetX: number;
  offsetY: number;
  visible: boolean;
}

const TradeSystemsOverlay = memo(({ sessionId, offsetX, offsetY, visible }: Props) => {
  const [nodes, setNodes] = useState<NodeRow[]>([]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("province_nodes")
        .select("id, hex_q, hex_r, trade_system_id")
        .eq("session_id", sessionId)
        .eq("is_active", true);
      if (!cancelled) setNodes((data || []) as NodeRow[]);
    };
    void load();
    const ch = supabase
      .channel(`trade-sys-${sessionId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "province_nodes", filter: `session_id=eq.${sessionId}` },
        () => { void load(); })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [sessionId, visible]);

  // Map system_id → stable color index
  const colorByid = useMemo(() => {
    const ids = Array.from(new Set(nodes.map(n => n.trade_system_id).filter(Boolean))) as string[];
    ids.sort();
    const map = new Map<string, string>();
    ids.forEach((id, i) => map.set(id, SYSTEM_COLORS[i % SYSTEM_COLORS.length]));
    return map;
  }, [nodes]);

  const elements = useMemo(() => {
    if (!visible) return null;
    return nodes.map(n => {
      if (!n.trade_system_id) return null;
      const px = hexToPixel(n.hex_q, n.hex_r);
      const color = colorByid.get(n.trade_system_id) || "hsl(0,0%,60%)";
      return (
        <circle
          key={`ts-${n.id}`}
          cx={px.x + offsetX}
          cy={px.y + offsetY}
          r={20}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeDasharray="3,3"
          opacity={0.65}
          style={{ pointerEvents: "none" }}
        />
      );
    });
  }, [nodes, colorByid, offsetX, offsetY, visible]);

  if (!visible) return null;
  return <g className="trade-systems-layer">{elements}</g>;
});

TradeSystemsOverlay.displayName = "TradeSystemsOverlay";
export default TradeSystemsOverlay;
