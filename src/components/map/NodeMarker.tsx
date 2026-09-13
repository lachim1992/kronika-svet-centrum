import { memo } from "react";

export type NodeGlyph = { id: string; name: string; node_type: string; node_tier: string };

const OWN_STONE = "var(--map-city-wall-light)";
const DARK_STONE = "var(--map-city-wall-dark)";
const EDGE = "var(--map-marker-edge)";
const ACCENT = "var(--map-focus)";
const BASE = "var(--map-city-base)";

/** Static isometric silhouettes per node type, sized by tier. No animation. */
function NodeMarkerBase({ node }: { node: NodeGlyph }) {
  const tier = node.node_tier === "major" ? 1.18 : node.node_tier === "minor" ? 1 : 0.82;
  const pad = node.node_tier === "major" ? 16 : node.node_tier === "minor" ? 13 : 11;

  const house = (x: number, y: number, h: number, roof = ACCENT) => (
    <g transform={`translate(${x},${y})`}>
      <path d={`M0 ${-h} L4 ${-h + 2.4} V2.4 L0 5 Z`} fill={OWN_STONE} stroke={EDGE} strokeWidth=".6" />
      <path d={`M0 ${-h} L-4 ${-h + 2.4} V2.4 L0 5 Z`} fill={DARK_STONE} stroke={EDGE} strokeWidth=".6" />
      <path d={`M-5 ${-h + 2.4} L0 ${-h - 1.6} L5 ${-h + 2.4} L0 ${-h + 6} Z`} fill={roof} stroke={EDGE} strokeWidth=".6" />
    </g>
  );

  const body = (() => {
    switch (node.node_type) {
      case "fortress":
        return <>
          <path d="M-11 2 L0 8 L11 2 L0 -4 Z" fill={BASE} stroke={EDGE} strokeWidth="1" />
          <path d="M-10 1 L0 7 L10 1 M-10 1 V-4 M10 1 V-4" fill="none" stroke={ACCENT} strokeWidth="2.2" strokeLinecap="square" />
          {house(0, -2, 13, ACCENT)}
          <rect x="-10" y="-6" width="3.5" height="7" fill={OWN_STONE} stroke={EDGE} strokeWidth=".6" />
          <rect x="6.5" y="-6" width="3.5" height="7" fill={OWN_STONE} stroke={EDGE} strokeWidth=".6" />
        </>;
      case "port":
        return <>
          <path d="M-12 2 L0 8 L12 2 L0 -4 Z" fill={BASE} stroke={EDGE} strokeWidth="1" />
          <path d="M-11 3 L2 -4 L9 0 L-4 7 Z" fill={DARK_STONE} stroke={EDGE} strokeWidth=".7" />
          {house(-4, -2, 9)}
          <path d="M6 0 V-12 M6 -12 L12 -8" stroke={EDGE} strokeWidth="1.1" fill="none" />
          <path d="M6 -12 L12 -8 L6 -6 Z" fill={ACCENT} stroke={EDGE} strokeWidth=".6" />
        </>;
      case "trade_hub":
        return <>
          <path d="M-12 2 L0 8 L12 2 L0 -4 Z" fill={BASE} stroke={EDGE} strokeWidth="1" />
          {house(-6, -1, 8)}
          {house(6, -1, 8)}
          <path d="M-9 -7 L0 -13 L9 -7 L0 -1 Z" fill={ACCENT} stroke={EDGE} strokeWidth=".7" opacity=".9" />
        </>;
      case "primary_city":
      case "secondary_city":
      case "village_cluster":
      case "neutral_settlement": {
        const count = node.node_type === "primary_city" ? 5 : node.node_type === "secondary_city" ? 4 : 3;
        const spots = [{ x: -7, y: 1, h: 8 }, { x: 5, y: 2, h: 7 }, { x: -1, y: -4, h: 11 }, { x: -10, y: -4, h: 7 }, { x: 9, y: -3, h: 8 }];
        return <>
          <path d="M-12 2 L0 8 L12 2 L0 -4 Z" fill={BASE} stroke={EDGE} strokeWidth="1" />
          {spots.slice(0, count).map((spot, index) => <g key={index}>{house(spot.x, spot.y, spot.h)}</g>)}
        </>;
      }
      case "shrine":
      case "religious_center":
        return <>
          <path d="M-10 2 L0 7 L10 2 L0 -3 Z" fill={BASE} stroke={EDGE} strokeWidth="1" />
          {house(0, -1, 12, OWN_STONE)}
          <path d="M0 -16 V-22 M-3 -19 H3" stroke={ACCENT} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </>;
      case "ruin":
        return <>
          <path d="M-9 2 L0 7 L9 2 L0 -3 Z" fill={BASE} stroke={EDGE} strokeWidth=".8" opacity=".8" />
          <path d="M-6 2 V-6 L-2 -8 V2 Z" fill={DARK_STONE} stroke={EDGE} strokeWidth=".6" />
          <path d="M2 3 V-3 L6 -5 V1 Z" fill={OWN_STONE} stroke={EDGE} strokeWidth=".6" />
        </>;
      case "resource_outpost":
        return <>
          <path d="M-10 2 L0 7 L10 2 L0 -3 Z" fill={BASE} stroke={EDGE} strokeWidth=".9" />
          {house(-3, 0, 8)}
          <path d="M5 1 L5 -8 L10 -4 Z" fill={ACCENT} stroke={EDGE} strokeWidth=".6" />
        </>;
      default:
        // resource_node: a small quarry / stockpile mound.
        return <>
          <path d="M-9 2 L0 7 L9 2 L0 -3 Z" fill={BASE} stroke={EDGE} strokeWidth=".8" />
          <path d="M-5 2 L0 -5 L5 2 Z" fill={OWN_STONE} stroke={EDGE} strokeWidth=".7" />
          <path d="M0 -5 L5 2 L0 4 Z" fill={DARK_STONE} stroke={EDGE} strokeWidth=".7" />
        </>;
    }
  })();

  return <g transform={`scale(${tier})`}>
    {body}
    <title>{node.name} · {node.node_type.replace(/_/g, " ")} ({node.node_tier})</title>
    <rect x={-pad} y="-4" width={pad * 2} height="12" fill="transparent" />
  </g>;
}

export const NodeMarker = memo(NodeMarkerBase);
export default NodeMarker;
