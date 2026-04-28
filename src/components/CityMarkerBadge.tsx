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
  /** Optional image URL for city avatar (circular) */
  imageUrl?: string | null;
  /** Optional pixel art map icon — if present, replaces the circular badge */
  mapIconUrl?: string | null;
  /** Population count — drives marker radius */
  population?: number;
  /** sm = base 10, md = base 14 (before population scaling) */
  size?: "sm" | "md";
  cx: number;
  cy: number;
  onClick?: (e: React.MouseEvent) => void;
}

/** Map population to a radius multiplier (0.7 – 1.6) */
function popScale(pop: number): number {
  if (pop <= 500) return 0.7;
  if (pop >= 10000) return 1.6;
  const t = (Math.log(pop) - Math.log(500)) / (Math.log(10000) - Math.log(500));
  return 0.7 + t * 0.9;
}

const CityMarkerBadge = memo(({
  cityId, cityName, settlementLevel, ownerPlayer, isCapital,
  imageUrl, mapIconUrl, population = 1000, size = "md", cx, cy, onClick,
}: CityMarkerProps) => {
  const baseR = size === "sm" ? 15 : 21; // +50%
  const r = Math.round(baseR * popScale(population));
  const icon = SETTLEMENT_ICONS[settlementLevel] || SETTLEMENT_ICONS.HAMLET;
  const nameSize = Math.max(8, Math.round(r * 0.48));
  // Wrap long names onto up to 2 lines (split at space near the middle, fallback to char split)
  const wrapMax = size === "sm" ? 12 : 16;
  const nameLines: string[] = (() => {
    if (cityName.length <= wrapMax) return [cityName];
    const mid = Math.floor(cityName.length / 2);
    const spaceIdx = cityName.lastIndexOf(" ", mid + 4);
    if (spaceIdx > 2 && spaceIdx < cityName.length - 2) {
      return [cityName.slice(0, spaceIdx), cityName.slice(spaceIdx + 1)];
    }
    // hard break
    return [cityName.slice(0, wrapMax), cityName.slice(wrapMax, wrapMax * 2)];
  })();
  const clipId = `city-clip-${cityId}`;

  // ── Pixel art sprite mode ──
  if (mapIconUrl) {
    const spriteSize = Math.round(r * 4.2); // fill entire hex
    return (
      <g
        onClick={(e) => { e.stopPropagation(); onClick?.(e); }}
        className="cursor-pointer"
        style={{ pointerEvents: "all" }}
      >
        {/* Invisible click target */}
        <rect
          x={cx - spriteSize / 2} y={cy - spriteSize / 2 - 4}
          width={spriteSize} height={spriteSize}
          fill="transparent"
          style={{ pointerEvents: "all" }}
        />

        {/* Drop shadow */}
        <ellipse cx={cx} cy={cy + spriteSize * 0.35} rx={spriteSize * 0.35} ry={spriteSize * 0.12}
          fill="black" opacity={0.2} style={{ pointerEvents: "none" }} />

        {/* Pixel art sprite */}
        <image
          href={mapIconUrl}
          x={cx - spriteSize / 2} y={cy - spriteSize / 2 - 4}
          width={spriteSize} height={spriteSize}
          preserveAspectRatio="xMidYMid meet"
          style={{ pointerEvents: "none", imageRendering: "pixelated" }}
        />

        {/* Capital crown */}
        {isCapital && (
          <text
            x={cx + spriteSize * 0.35} y={cy - spriteSize * 0.35}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={size === "sm" ? 7 : 9}
            style={{ pointerEvents: "none" }}
          >
            👑
          </text>
        )}

        {/* City name below sprite (multi-line) */}
        {nameLines.map((ln, i) => (
          <text key={i}
            x={cx} y={cy + spriteSize * 0.4 + i * (nameSize + 1)}
            textAnchor="middle" dominantBaseline="hanging"
            fill="white" fontSize={nameSize} fontWeight="700"
            style={{ pointerEvents: "none", textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}
          >
            {ln}
          </text>
        ))}
      </g>
    );
  }

  // ── Circular badge mode (fallback) ──
  const fontSize = Math.round(r * 0.75);

  return (
    <g
      onClick={(e) => { e.stopPropagation(); onClick?.(e); }}
      className="cursor-pointer"
      style={{ pointerEvents: "all" }}
    >
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
