/**
 * Client-side helpers for the province graph strategic layer.
 * Provides commands for route-based movement, route building, node fortification,
 * and construction projects.
 */
import { dispatchCommand } from "@/lib/commands";

/** Move a military stack along a route to a target node */
export async function moveStackRoute(params: {
  sessionId: string;
  turnNumber?: number;
  playerName: string;
  stackId: string;
  stackName?: string;
  targetNodeId: string;
  routeId?: string;
}) {
  return dispatchCommand({
    sessionId: params.sessionId,
    turnNumber: params.turnNumber,
    actor: { name: params.playerName, type: "player" },
    commandType: "MOVE_STACK_ROUTE",
    commandPayload: {
      stackId: params.stackId,
      stackName: params.stackName,
      targetNodeId: params.targetNodeId,
      routeId: params.routeId,
    },
  });
}

/** Build a new route between two nodes */
export async function buildRoute(params: {
  sessionId: string;
  turnNumber?: number;
  playerName: string;
  nodeAId: string;
  nodeBId: string;
  routeType?: string;
}) {
  return dispatchCommand({
    sessionId: params.sessionId,
    turnNumber: params.turnNumber,
    actor: { name: params.playerName, type: "player" },
    commandType: "BUILD_ROUTE",
    commandPayload: {
      nodeAId: params.nodeAId,
      nodeBId: params.nodeBId,
      routeType: params.routeType || "land_road",
    },
  });
}

/** Upgrade an existing route */
export async function upgradeRoute(params: {
  sessionId: string;
  turnNumber?: number;
  playerName: string;
  routeId: string;
}) {
  return dispatchCommand({
    sessionId: params.sessionId,
    turnNumber: params.turnNumber,
    actor: { name: params.playerName, type: "player" },
    commandType: "UPGRADE_ROUTE",
    commandPayload: { routeId: params.routeId },
  });
}

/** Fortify a strategic node with a stack */
export async function fortifyNode(params: {
  sessionId: string;
  turnNumber?: number;
  playerName: string;
  nodeId: string;
  stackId?: string;
}) {
  return dispatchCommand({
    sessionId: params.sessionId,
    turnNumber: params.turnNumber,
    actor: { name: params.playerName, type: "player" },
    commandType: "FORTIFY_NODE",
    commandPayload: {
      nodeId: params.nodeId,
      stackId: params.stackId,
    },
  });
}

/** Blockade a route with a stack */
export async function blockadeRoute(params: {
  sessionId: string;
  turnNumber?: number;
  playerName: string;
  stackId: string;
  routeId: string;
}) {
  return dispatchCommand({
    sessionId: params.sessionId,
    turnNumber: params.turnNumber,
    actor: { name: params.playerName, type: "player" },
    commandType: "BLOCKADE_ROUTE",
    commandPayload: { stackId: params.stackId, routeId: params.routeId },
  });
}

/** Set ambush on a route */
export async function ambushRoute(params: {
  sessionId: string;
  turnNumber?: number;
  playerName: string;
  stackId: string;
  routeId: string;
}) {
  return dispatchCommand({
    sessionId: params.sessionId,
    turnNumber: params.turnNumber,
    actor: { name: params.playerName, type: "player" },
    commandType: "AMBUSH_ROUTE",
    commandPayload: { stackId: params.stackId, routeId: params.routeId },
  });
}

/** Begin siege of a strategic node */
export async function siegeNode(params: {
  sessionId: string;
  turnNumber?: number;
  playerName: string;
  stackId: string;
  nodeId: string;
}) {
  return dispatchCommand({
    sessionId: params.sessionId,
    turnNumber: params.turnNumber,
    actor: { name: params.playerName, type: "player" },
    commandType: "SIEGE_NODE",
    commandPayload: { stackId: params.stackId, nodeId: params.nodeId },
  });
}

/** Disrupt / sabotage a route */
export async function disruptRoute(params: {
  sessionId: string;
  turnNumber?: number;
  playerName: string;
  routeId: string;
  stackId?: string;
}) {
  return dispatchCommand({
    sessionId: params.sessionId,
    turnNumber: params.turnNumber,
    actor: { name: params.playerName, type: "player" },
    commandType: "DISRUPT_ROUTE",
    commandPayload: { routeId: params.routeId, stackId: params.stackId },
  });
}

/** Start a construction project */
export async function startProject(params: {
  sessionId: string;
  turnNumber?: number;
  playerName: string;
  projectType: string;
  nodeId?: string;
  routeId?: string;
  targetNodeId?: string;
  provinceId?: string;
  customName?: string;
}) {
  return dispatchCommand({
    sessionId: params.sessionId,
    turnNumber: params.turnNumber,
    actor: { name: params.playerName, type: "player" },
    commandType: "START_PROJECT",
    commandPayload: {
      projectType: params.projectType,
      nodeId: params.nodeId,
      routeId: params.routeId,
      targetNodeId: params.targetNodeId,
      provinceId: params.provinceId,
      customName: params.customName,
    },
  });
}

/** Cancel an active project */
export async function cancelProject(params: {
  sessionId: string;
  turnNumber?: number;
  playerName: string;
  projectId: string;
}) {
  return dispatchCommand({
    sessionId: params.sessionId,
    turnNumber: params.turnNumber,
    actor: { name: params.playerName, type: "player" },
    commandType: "CANCEL_PROJECT",
    commandPayload: { projectId: params.projectId },
  });
}

/** Project type labels */
export const PROJECT_TYPE_LABELS: Record<string, string> = {
  build_route: "Stavba cesty",
  upgrade_route: "Vylepšení cesty",
  create_fort: "Stavba pevnosti",
  create_port: "Stavba přístavu",
  expand_hub: "Rozšíření centra",
  repair_route: "Oprava cesty",
};

/** Project costs for UI display */
export const PROJECT_COSTS: Record<string, { gold: number; wood: number; stone: number; iron: number; turns: number }> = {
  build_route: { gold: 50, wood: 30, stone: 20, iron: 0, turns: 3 },
  upgrade_route: { gold: 30, wood: 10, stone: 15, iron: 5, turns: 2 },
  create_fort: { gold: 100, wood: 40, stone: 60, iron: 30, turns: 5 },
  create_port: { gold: 80, wood: 50, stone: 40, iron: 10, turns: 4 },
  expand_hub: { gold: 60, wood: 20, stone: 30, iron: 10, turns: 3 },
  repair_route: { gold: 20, wood: 15, stone: 10, iron: 0, turns: 2 },
};

/** Route type labels in Czech */
export const ROUTE_TYPE_LABELS: Record<string, string> = {
  land_road: "Silnice",
  river_route: "Říční cesta",
  sea_lane: "Námořní trasa",
  mountain_pass: "Horský průsmyk",
  caravan_route: "Karavanní stezka",
  road: "Cesta",
  caravan: "Karavana",
  river: "Řeka",
  pass: "Průsmyk",
  fortified_corridor: "Opevněný koridor",
  custom_project: "Vlastní projekt",
};

/** Control state labels */
export const CONTROL_STATE_LABELS: Record<string, string> = {
  open: "Průchozí",
  contested: "Sporná",
  blocked: "Zablokovaná",
  damaged: "Poškozená",
  embargoed: "Embargo",
};

/** Node type labels */
export const NODE_TYPE_LABELS: Record<string, string> = {
  primary_city: "Hlavní město",
  secondary_city: "Město",
  fortress: "Pevnost",
  port: "Přístav",
  trade_hub: "Tržiště",
  pass: "Průsmyk",
  resource_node: "Zdroj surovin",
  village_cluster: "Vesnice",
  religious_center: "Chrám",
  logistic_hub: "Logistické centrum",
};

/** Flow role labels */
export const FLOW_ROLE_LABELS: Record<string, string> = {
  neutral: "Neutrální",
  regulator: "Regulátor",
  gateway: "Brána",
  producer: "Producent",
  hub: "Centrum",
};

/** Hinterland level labels */
export const HINTERLAND_LABELS: Record<number, string> = {
  0: "Pustina",
  1: "Vesnice",
  2: "Dílny",
  3: "Předměstí",
};

/** Stance labels */
export const STANCE_LABELS: Record<string, string> = {
  idle: "Čeká",
  marching: "Na pochodu",
  besieging: "Obléhá",
  defending: "Brání",
  intercepting: "Zachycuje",
  raiding: "Plení",
};

/** Battle context labels */
export const BATTLE_CONTEXT_LABELS: Record<string, string> = {
  node_siege: "Obléhání uzlu",
  route_ambush: "Přepad na cestě",
  route_blockade: "Průlom blokády",
  field_battle: "Polní bitva",
};

/** World route kind labels */
export const WORLD_ROUTE_KIND_LABELS: Record<string, string> = {
  sea_lane: "Námořní osa",
  imperial_road: "Imperiální silnice",
  trade_corridor: "Obchodní koridor",
  pilgrimage: "Poutní cesta",
  military_axis: "Vojenská osa",
};
