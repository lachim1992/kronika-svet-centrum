import { memo } from "react";

const SETTLEMENT_ICONS: Record<string, string> = {
  HAMLET: "🏕️",
  TOWNSHIP: "🏘️",
  CITY: "🏰",
  POLIS: "🏛️",
};

export interface CityMarkerProps {
  cityId: string;
  cityName: string;
  settlementLevel: string;
  ownerPlayer: string;
  isCapital?: boolean;
  /** Optional image URL for city avatar */
  imageUrl?: string | null;
  /** sm = 12px radius, md = 16px radius */
  size?: "sm" | "md";
  cx: number;
  cy: number;
  onClick?: (e: React.MouseEvent) => void;
}

const CityMarkerBadge = memo(({
  cityId, cityName, settlementLevel, ownerPlayer, isCapital,
  imageUrl, size = "md", cx, cy, onClick,
}: CityMarkerProps) => {
  const r = size === "sm" ? 12 : 16;
  const icon = SETTLEMENT_ICONS[settlementLevel] || SETTLEMENT_ICONS.HAMLET;
  const fontSize = size === "sm" ? 9 : 12;
  const nameSize = size === "sm" ? 5.5 : 7;
  const nameMaxLen = size === "sm" ? 7 : 10;
  const displayName = cityName.length > nameMaxLen ? cityName.slice(0, nameMaxLen - 1) + "…" : cityName;
  const clipId = `city-clip-${cityId}`;

  return (
    <g
      onClick={(e) => { e.stopPropagation(); onClick?.(e); }}
      className="cursor-pointer"
      style={{ pointerEvents: "all" }}
    >
      {/* Clip path for circular image */}
      <defs>
        <clipPath id={clipId}>
          <circle cx={cx} cy={cy - 4} r={r} />
        </clipPath>
      </defs>

      {/* Drop shadow */}
      <circle cx={cx} cy={cy - 4} r={r + 1} fill="black" opacity={0.25} />

      {/* Background circle */}
      <circle
        cx={cx} cy={cy - 4} r={r}
        fill="hsl(var(--card))"
        stroke={isCapital ? "hsl(45, 90%, 55%)" : "hsl(var(--border))"}
        strokeWidth={isCapital ? 2 : 1.2}
      />

      {/* City image or fallback icon */}
      {imageUrl ? (
        <image
          href={imageUrl}
          x={cx - r} y={cy - 4 - r}
          width={r * 2} height={r * 2}
          clipPath={`url(#${clipId})`}
          preserveAspectRatio="xMidYMid slice"
          style={{ pointerEvents: "none" }}
        />
      ) : (
        <text
          x={cx} y={cy - 3}
          textAnchor="middle" dominantBaseline="middle"
          fontSize={fontSize}
          style={{ pointerEvents: "none" }}
        >
          {icon}
        </text>
      )}

      {/* Border ring on top of image */}
      {imageUrl && (
        <circle
          cx={cx} cy={cy - 4} r={r}
          fill="none"
          stroke={isCapital ? "hsl(45, 90%, 55%)" : "hsl(var(--border))"}
          strokeWidth={isCapital ? 2 : 1.2}
        />
      )}

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
        fill="white" fontSize={nameSize} fontWeight="700"
        style={{ pointerEvents: "none", textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}
      >
        {displayName}
      </text>

      {/* Owner name */}
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
