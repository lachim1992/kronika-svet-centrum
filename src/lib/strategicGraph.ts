/**
 * Client-side helpers for the province graph strategic layer.
 * Provides commands for route-based movement, route building, and node fortification.
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

/** Route type labels in Czech */
export const ROUTE_TYPE_LABELS: Record<string, string> = {
  land_road: "Silnice",
  river_route: "Říční cesta",
  sea_lane: "Námořní trasa",
  mountain_pass: "Horský průsmyk",
  caravan_route: "Karavanní stezka",
};

/** Control state labels */
export const CONTROL_STATE_LABELS: Record<string, string> = {
  open: "Průchozí",
  contested: "Sporná",
  blocked: "Zablokovaná",
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
};
