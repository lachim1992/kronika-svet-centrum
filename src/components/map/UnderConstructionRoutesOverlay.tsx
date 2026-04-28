/**
 * UnderConstructionRoutesOverlay — Stage 8
 *
 * Renders province_routes whose construction_state='under_construction'
 * as dashed pulsing lines along their hex flow_path. Shows a progress
 * label at midpoint (progress / total_work).
 */
import { memo, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const HEX_SIZE = 38;
const SQRT3 = Math.sqrt(3);
function hexToPixel(q: number, r: number) {
  return { x: HEX_SIZE * (SQRT3 * q + (SQRT3 / 2) * r), y: HEX_SIZE * 1.5 * r };
}

interface RouteRow {
  id: string;
  node_a: string;
  node_b: string;
  route_type: string;
  metadata: any;
}

interface FlowPathRow {
  route_id: string | null;
  hex_path: Array<{ q: number; r: number }> | null;
}

interface Props {
  sessionId: string;
  offsetX: number;
  offsetY: number;
  visible: boolean;
}

const UnderConstructionRoutesOverlay = memo(({ sessionId, offsetX, offsetY, visible }: Props) => {
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [flowPaths, setFlowPaths] = useState<Map<string, Array<{ q: number; r: number }>>>(new Map());

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const load = async () => {
      const { data: r } = await supabase
        .from("province_routes")
        .select("id, node_a, node_b, route_type, metadata")
        .eq("session_id", sessionId)
        .eq("construction_state", "under_construction");
      const ids = (r || []).map((x: any) => x.id);
      const fpMap = new Map<string, Array<{ q: number; r: number }>>();
      if (ids.length > 0) {
        const { data: fps } = await supabase
          .from("flow_paths")
          .select("route_id, hex_path")
          .in("route_id", ids);
        for (const fp of (fps || []) as FlowPathRow[]) {
          if (fp.route_id && Array.isArray(fp.hex_path) && fp.hex_path.length >= 2) {
            fpMap.set(fp.route_id, fp.hex_path.map(h => ({ q: h.q, r: h.r })));
          }
        }
        // Fallback: hex_path stored in metadata when freshly created (Stage 6).
        for (const route of (r || []) as RouteRow[]) {
          if (!fpMap.has(route.id)) {
            const md = route.metadata || {};
            if (Array.isArray(md.hex_path) && md.hex_path.length >= 2) {
              fpMap.set(route.id, md.hex_path.map((h: any) => ({ q: h.q, r: h.r })));
            }
          }
        }
      }
      if (cancelled) return;
      setRoutes((r || []) as RouteRow[]);
      setFlowPaths(fpMap);
    };
    void load();
    const ch = supabase
      .channel(`uc-routes-${sessionId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "province_routes", filter: `session_id=eq.${sessionId}` },
        () => { void load(); })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [sessionId, visible]);

  const elements = useMemo(() => {
    if (!visible) return null;
    return routes.map(route => {
      const path = flowPaths.get(route.id);
      if (!path) return null;
      const points = path.map(p => {
        const px = hexToPixel(p.q, p.r);
        return `${px.x + offsetX},${px.y + offsetY}`;
      }).join(" ");
      const md = route.metadata || {};
      const total = Number(md.total_work || 0);
      const progress = Number(md.progress || 0);
      const pct = total > 0 ? Math.round((progress / total) * 100) : 0;
      const mid = path[Math.floor(path.length / 2)];
      const midPx = hexToPixel(mid.q, mid.r);
      return (
        <g key={`uc-${route.id}`} style={{ pointerEvents: "none" }}>
          <polyline
            points={points}
            fill="none"
            stroke="hsl(45, 95%, 55%)"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="6,5"
            opacity={0.95}
          >
            <animate attributeName="stroke-dashoffset" values="0;-22" dur="1.2s" repeatCount="indefinite" />
          </polyline>
          <g transform={`translate(${midPx.x + offsetX}, ${midPx.y + offsetY - 18})`}>
            <rect x={-22} y={-9} width={44} height={16} rx={4}
              fill="hsl(45, 95%, 55%)" opacity={0.92} />
            <text x={0} y={2} textAnchor="middle"
              fontSize={10} fontWeight={700} fill="hsl(0, 0%, 8%)"
              style={{ fontFamily: "ui-monospace, monospace" }}>
              {pct}%
            </text>
          </g>
        </g>
      );
    });
  }, [routes, flowPaths, offsetX, offsetY, visible]);

  if (!visible) return null;
  return <g className="under-construction-routes-layer">{elements}</g>;
});

UnderConstructionRoutesOverlay.displayName = "UnderConstructionRoutesOverlay";
export default UnderConstructionRoutesOverlay;
