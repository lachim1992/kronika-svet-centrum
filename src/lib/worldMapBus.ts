/**
 * worldMapBus — lightweight CustomEvent bus to coordinate WorldMap interactions
 * (build-panel waypoint picking, route detail sheet, etc.) without prop-drilling
 * through the giant WorldHexMap component.
 *
 * Events:
 *   - "worldmap:hex-click"      detail: { q, r }   (emitted by WorldHexMap when build mode is active)
 *   - "worldmap:route-click"    detail: { routeId } (emitted by RoadNetworkOverlay)
 *   - "worldmap:build-mode"     detail: { active }  (emitted by WorldMapBuildPanel)
 *   - "worldmap:focus-build"    detail: { nodeId }  (emitted by RouteDetailSheet → "Stavět odsud")
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
