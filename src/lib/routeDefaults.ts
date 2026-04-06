/**
 * Shared route creation utility — single source of truth for default route values
 * and automated post-creation flow recomputation.
 */
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface RouteCreateParams {
  sessionId: string;
  nodeA: string;
  nodeB: string;
  routeType: string;
  /** Override defaults below */
  capacity?: number;
  speedValue?: number;
  safetyValue?: number;
  economicRelevance?: number;
  militaryRelevance?: number;
  controlState?: string;
  upgradeLevel?: number;
}

/** Smart defaults per route type */
const ROUTE_DEFAULTS: Record<string, {
  capacity: number; speed: number; safety: number;
  economic: number; military: number;
}> = {
  land_road:      { capacity: 10, speed: 1.0, safety: 1.0, economic: 0.5, military: 0.3 },
  river_route:    { capacity: 8,  speed: 1.5, safety: 0.8, economic: 0.7, military: 0.1 },
  sea_lane:       { capacity: 15, speed: 2.0, safety: 0.6, economic: 0.9, military: 0.2 },
  caravan_route:  { capacity: 6,  speed: 0.7, safety: 0.5, economic: 0.8, military: 0.1 },
};

export function getRouteDefaults(routeType: string) {
  return ROUTE_DEFAULTS[routeType] || ROUTE_DEFAULTS.land_road;
}

/**
 * Create a province_route with smart defaults, then trigger hex-flow recompute.
 * Returns the created route id or null on error.
 */
export async function createRoute(params: RouteCreateParams): Promise<string | null> {
  const { sessionId, nodeA, nodeB, routeType } = params;
  if (!nodeA || !nodeB || nodeA === nodeB) {
    toast.error("Vyber dva různé uzly");
    return null;
  }

  const defaults = getRouteDefaults(routeType);

  try {
    const { data, error } = await supabase.from("province_routes").insert({
      session_id: sessionId,
      node_a: nodeA,
      node_b: nodeB,
      route_type: routeType,
      control_state: params.controlState ?? "open",
      capacity_value: params.capacity ?? defaults.capacity,
      speed_value: params.speedValue ?? defaults.speed,
      safety_value: params.safetyValue ?? defaults.safety,
      economic_relevance: params.economicRelevance ?? defaults.economic,
      military_relevance: params.militaryRelevance ?? defaults.military,
      upgrade_level: params.upgradeLevel ?? 0,
      path_dirty: true,
    } as any).select("id").single();

    if (error) throw error;
    toast.success("Trasa vytvořena");

    // Auto-recompute hex flows
    supabase.functions.invoke("compute-hex-flows", {
      body: { session_id: sessionId },
    }).then(({ error: flowErr }) => {
      if (flowErr) console.warn("Auto-recompute hex-flows failed:", flowErr);
    });

    return data?.id || null;
  } catch (e: any) {
    toast.error("Chyba: " + e.message);
    return null;
  }
}
