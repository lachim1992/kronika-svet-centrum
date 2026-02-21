import { memo } from "react";

/**
 * Compact city marker for use inside SVG hex tiles.
 * Mirrors the visual style of the city badge in CityDirectory:
 * round icon with border, settlement level indicator.
 */

const SETTLEMENT_ICONS: Record<string, string> = {
  HAMLET: "🏕️",
  TOWNSHIP: "🏘️",
  CITY: "🏰",
  POLIS: "🏛️",
};

const SETTLEMENT_LABELS: Record<string, string> = {
  HAMLET: "Osada",
  TOWNSHIP: "Městečko",
  CITY: "Město",
  POLIS: "Polis",
};

export interface CityMarkerProps {
  cityId: string;
  cityName: string;
  settlementLevel: string;
  ownerPlayer: string;
  isCapital?: boolean;
  /** sm = 14px radius, md = 18px radius */
  size?: "sm" | "md";
  /** Center X in SVG coords */
  cx: number;
  /** Center Y in SVG coords */
  cy: number;
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * SVG-native city marker rendered inside the hex tile.
 * Shows a filled circle with settlement icon, name below,
 * and optional capital crown indicator.
 */
const CityMarkerBadge = memo(({
  cityName, settlementLevel, ownerPlayer, isCapital,
  size = "md", cx, cy, onClick,
}: CityMarkerProps) => {
  const r = size === "sm" ? 12 : 16;
  const icon = SETTLEMENT_ICONS[settlementLevel] || SETTLEMENT_ICONS.HAMLET;
  const fontSize = size === "sm" ? 9 : 12;
  const nameSize = size === "sm" ? 5.5 : 7;
  const nameMaxLen = size === "sm" ? 7 : 10;
  const displayName = cityName.length > nameMaxLen ? cityName.slice(0, nameMaxLen - 1) + "…" : cityName;

  return (
    <g
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      className="cursor-pointer"
      style={{ pointerEvents: "all" }}
    >
      {/* Drop shadow */}
      <circle cx={cx} cy={cy - 4} r={r + 1} fill="black" opacity={0.25} />
      {/* Background circle */}
      <circle
        cx={cx} cy={cy - 4} r={r}
        fill="hsl(var(--card))"
        stroke={isCapital ? "hsl(45, 90%, 55%)" : "hsl(var(--border))"}
        strokeWidth={isCapital ? 2 : 1.2}
      />
      {/* Settlement icon */}
      <text
        x={cx} y={cy - 3}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={fontSize}
        style={{ pointerEvents: "none" }}
      >
        {icon}
      </text>
      {/* Capital crown */}
      {isCapital && (
        <text
          x={cx + r * 0.7} y={cy - 4 - r * 0.7}
          textAnchor="middle" dominantBaseline="middle"
          fontSize={size === "sm" ? 7 : 9}
          style={{ pointerEvents: "none" }}
        >
          👑
        </text>
      )}
      {/* City name */}
      <text
        x={cx} y={cy + r - 1}
        textAnchor="middle" dominantBaseline="hanging"
        fill="white"
        fontSize={nameSize}
        fontWeight="700"
        style={{ pointerEvents: "none", textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}
      >
        {displayName}
      </text>
      {/* Owner name (small, below) */}
      <text
        x={cx} y={cy + r + nameSize + 1}
        textAnchor="middle" dominantBaseline="hanging"
        fill="hsl(var(--muted-foreground))"
        fontSize={size === "sm" ? 4.5 : 5.5}
        opacity={0.7}
        style={{ pointerEvents: "none" }}
      >
        {ownerPlayer}
      </text>
    </g>
  );
});

CityMarkerBadge.displayName = "CityMarkerBadge";

export default CityMarkerBadge;
