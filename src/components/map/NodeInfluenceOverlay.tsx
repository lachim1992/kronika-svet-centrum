/**
 * NodeInfluenceOverlay — vizualizace vlivového tlaku hráčů na neutrální / anektované uzly.
 *
 * Pro každý objevený neutral node renderuje:
 *  - kruh kolem nodu (poloměr ~ integration pressure)
 *  - barvu dle vedoucího hráče (hash → HSL)
 *  - vnitřní tečku pro autonomy / annexed stav
 *  - badge `CONTESTED` / `BLOCKED` (textový marker)
 *
 * Data: `province_nodes` (discovered, controlled_by, autonomy_score, hex_q/r)
 *       `node_influence` (player_name, economic/political/military)
 *       `node_blockades` (active = expires_turn > current_turn)
 */
import { useEffect, useMemo, useState, memo } from "react";
import { supabase } from "@/integrations/supabase/client";

const HEX_SIZE = 38;
const SQRT3 = Math.sqrt(3);
function hexToPixel(q: number, r: number) {
  return { x: HEX_SIZE * (SQRT3 * q + (SQRT3 / 2) * r), y: HEX_SIZE * 1.5 * r };
}

interface Node {
  id: string;
  hex_q: number;
  hex_r: number;
  is_neutral: boolean;
  discovered: boolean;
  controlled_by: string | null;
  autonomy_score: number | null;
  name: string;
}
interface InfluenceRow {
  node_id: string;
  player_name: string;
  economic_influence: number | null;
  political_influence: number | null;
  military_pressure: number | null;
}
interface BlockadeRow {
  node_id: string;
  blocked_until_turn: number;
}

interface Props {
  sessionId: string;
  currentTurn: number;
  offsetX: number;
  offsetY: number;
  visible: boolean;
}

function colorFor(player: string): string {
  let h = 0;
  for (let i = 0; i < player.length; i++) h = (h * 31 + player.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 70%, 55%)`;
}

function pressureOf(r: InfluenceRow): number {
  return (r.economic_influence || 0) + (r.political_influence || 0) + (r.military_pressure || 0);
}

const NodeInfluenceOverlay = memo(({ sessionId, currentTurn, offsetX, offsetY, visible }: Props) => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [influence, setInfluence] = useState<InfluenceRow[]>([]);
  const [blockades, setBlockades] = useState<BlockadeRow[]>([]);

  useEffect(() => {
    if (!visible || !sessionId) return;
    let cancelled = false;
    (async () => {
      const [{ data: nd }, { data: inf }, { data: bl }] = await Promise.all([
        supabase
          .from("province_nodes")
          .select("id, hex_q, hex_r, is_neutral, discovered, controlled_by, autonomy_score, name")
          .eq("session_id", sessionId)
          .eq("discovered", true),
        supabase
          .from("node_influence")
          .select("node_id, player_name, economic_influence, political_influence, military_pressure")
          .eq("session_id", sessionId),
        supabase
          .from("node_blockades")
          .select("node_id, blocked_until_turn")
          .eq("session_id", sessionId)
          .gt("blocked_until_turn", currentTurn),
      ]);
      if (cancelled) return;
      setNodes((nd || []) as Node[]);
      setInfluence((inf || []) as InfluenceRow[]);
      setBlockades((bl || []) as BlockadeRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, currentTurn, visible]);

  const renderItems = useMemo(() => {
    if (!visible) return [];
    const byNode = new Map<string, InfluenceRow[]>();
    for (const r of influence) {
      if (!byNode.has(r.node_id)) byNode.set(r.node_id, []);
      byNode.get(r.node_id)!.push(r);
    }
    const blocked = new Set(blockades.map((b) => b.node_id));

    return nodes
      .filter((n) => n.is_neutral || n.controlled_by)
      .map((n) => {
        const rows = (byNode.get(n.id) || []).sort((a, b) => pressureOf(b) - pressureOf(a));
        const top = rows[0];
        const second = rows[1];
        const topPressure = top ? pressureOf(top) : 0;
        const secondPressure = second ? pressureOf(second) : 0;
        const contested = top && second && secondPressure >= topPressure * 0.6;
        const isBlocked = blocked.has(n.id);
        const annexed = (n.autonomy_score ?? 100) <= 20 && n.controlled_by;
        const leadColor = n.controlled_by
          ? colorFor(n.controlled_by)
          : top
            ? colorFor(top.player_name)
            : "hsl(0, 0%, 50%)";
        const radius = annexed ? 22 : Math.max(10, Math.min(40, topPressure * 0.35));
        const { x, y } = hexToPixel(n.hex_q, n.hex_r);
        return { n, x: x + offsetX, y: y + offsetY, radius, leadColor, contested, isBlocked, annexed, topPressure };
      });
  }, [nodes, influence, blockades, visible, offsetX, offsetY]);

  if (!visible) return null;

  return (
    <g style={{ pointerEvents: "none" }}>
      {renderItems.map(({ n, x, y, radius, leadColor, contested, isBlocked, annexed, topPressure }) => (
        <g key={n.id}>
          <circle
            cx={x}
            cy={y}
            r={radius}
            fill={leadColor}
            opacity={annexed ? 0.35 : 0.18}
            stroke={leadColor}
            strokeWidth={annexed ? 2.5 : 1.5}
            strokeDasharray={contested ? "4,3" : undefined}
          />
          {annexed && <circle cx={x} cy={y} r={4} fill={leadColor} opacity={0.9} />}
          {(contested || isBlocked) && (
            <text
              x={x}
              y={y - radius - 4}
              textAnchor="middle"
              fontSize={9}
              fontWeight={700}
              fill={isBlocked ? "hsl(45, 90%, 55%)" : "hsl(0, 80%, 60%)"}
              stroke="hsl(0, 0%, 8%)"
              strokeWidth={2}
              paintOrder="stroke"
            >
              {isBlocked ? "BLOCKED" : "CONTESTED"}
            </text>
          )}
        </g>
      ))}
    </g>
  );
});

NodeInfluenceOverlay.displayName = "NodeInfluenceOverlay";
export default NodeInfluenceOverlay;
