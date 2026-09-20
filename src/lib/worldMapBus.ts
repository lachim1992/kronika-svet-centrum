/**
 * worldMapBus — lightweight CustomEvent bus to coordinate WorldMap interactions
 * (build-panel waypoint picking, route detail sheet, etc.) without prop-drilling
 * through the giant WorldHexMap component.
 *
 * Events:
 *   - "worldmap:hex-click"      detail: { q, r }   (emitted by WorldHexMap when build mode is active)
 *
 * Phase 5: the abstract province_routes build UI was removed, so only the
 * hex-click channel is still in use. The remaining event names are kept for the
 * physical road drafting flow on the map layer.
 */

export type HexCoord = { q: number; r: number };

export const WORLDMAP_EVENTS = {
  hexClick: "worldmap:hex-click",
  routeClick: "worldmap:route-click",
  buildMode: "worldmap:build-mode",
  focusBuild: "worldmap:focus-build",
} as const;

export function emitHexClick(coord: HexCoord) {
  window.dispatchEvent(new CustomEvent(WORLDMAP_EVENTS.hexClick, { detail: coord }));
}
export function emitRouteClick(routeId: string) {
  window.dispatchEvent(new CustomEvent(WORLDMAP_EVENTS.routeClick, { detail: { routeId } }));
}
export function emitBuildMode(active: boolean) {
  window.dispatchEvent(new CustomEvent(WORLDMAP_EVENTS.buildMode, { detail: { active } }));
}
export function emitFocusBuild(nodeId: string) {
  window.dispatchEvent(new CustomEvent(WORLDMAP_EVENTS.focusBuild, { detail: { nodeId } }));
}

/* Lazy state read for WorldHexMap (avoids extra subscribers) */
let _buildModeActive = false;
window.addEventListener(WORLDMAP_EVENTS.buildMode, (e: Event) => {
  _buildModeActive = !!(e as CustomEvent).detail?.active;
});
export function isBuildModeActive(): boolean {
  return _buildModeActive;
}
