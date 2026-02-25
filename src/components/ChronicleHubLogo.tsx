interface LogoProps {
  variant?: "full" | "mark";
  className?: string;
  size?: "sm" | "md" | "lg" | "hero";
  showTagline?: boolean;
}

const sizes = {
  sm: 32,
  md: 48,
  lg: 80,
  hero: 160,
};

/**
 * Pure SVG emblem: circular ring → open book → stylised tree.
 * Uses `currentColor` so it inherits from CSS (gold on dark, bronze on light).
 */
const Emblem = ({ size = 48 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 200 200"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="chGold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="hsl(var(--primary))" />
        <stop offset="50%" stopColor="hsl(var(--gold-glow))" />
        <stop offset="100%" stopColor="hsl(var(--primary))" />
      </linearGradient>
      <linearGradient id="chGoldFlat" x1="0.5" y1="0" x2="0.5" y2="1">
        <stop offset="0%" stopColor="hsl(var(--primary))" />
        <stop offset="100%" stopColor="hsl(var(--gold-muted))" />
      </linearGradient>
    </defs>

    {/* Outer ring */}
    <circle cx="100" cy="100" r="95" stroke="url(#chGold)" strokeWidth="2.5" fill="none" />
    <circle cx="100" cy="100" r="88" stroke="url(#chGold)" strokeWidth="0.8" fill="none" opacity="0.5" />

    {/* Open book */}
    <g transform="translate(100,145)">
      {/* Left page */}
      <path
        d="M-4,0 C-4,-12 -8,-18 -32,-22 L-32,-6 C-12,-2 -4,2 -4,0Z"
        fill="url(#chGoldFlat)"
        opacity="0.85"
      />
      {/* Right page */}
      <path
        d="M4,0 C4,-12 8,-18 32,-22 L32,-6 C12,-2 4,2 4,0Z"
        fill="url(#chGoldFlat)"
        opacity="0.85"
      />
      {/* Spine */}
      <line x1="0" y1="2" x2="0" y2="-22" stroke="url(#chGold)" strokeWidth="1.5" />
    </g>

    {/* Tree trunk growing from book */}
    <line x1="100" y1="123" x2="100" y2="68" stroke="url(#chGold)" strokeWidth="3" strokeLinecap="round" />

    {/* Tree branches — geometric, clean */}
    <g stroke="url(#chGold)" strokeWidth="2" strokeLinecap="round" fill="none">
      {/* Main left branch */}
      <path d="M100,100 Q88,90 75,78" />
      <path d="M75,78 Q70,70 65,60" />
      <path d="M75,78 Q80,68 78,58" />

      {/* Main right branch */}
      <path d="M100,100 Q112,90 125,78" />
      <path d="M125,78 Q130,70 135,60" />
      <path d="M125,78 Q120,68 122,58" />

      {/* Upper branches */}
      <path d="M100,88 Q90,76 82,65" />
      <path d="M100,88 Q110,76 118,65" />

      {/* Top crown */}
      <path d="M100,78 Q95,66 88,52" />
      <path d="M100,78 Q105,66 112,52" />
      <path d="M100,68 Q97,56 94,44" />
      <path d="M100,68 Q103,56 106,44" />
    </g>

    {/* Leaf dots at branch tips */}
    <g fill="url(#chGold)">
      <circle cx="65" cy="58" r="3" />
      <circle cx="78" cy="56" r="2.5" />
      <circle cx="88" cy="50" r="3" />
      <circle cx="94" cy="42" r="2.5" />
      <circle cx="106" cy="42" r="2.5" />
      <circle cx="112" cy="50" r="3" />
      <circle cx="122" cy="56" r="2.5" />
      <circle cx="135" cy="58" r="3" />
      <circle cx="82" cy="63" r="2.5" />
      <circle cx="118" cy="63" r="2.5" />
    </g>
  </svg>
);

const ChronicleHubLogo = ({
  variant = "full",
  className = "",
  size = "md",
  showTagline = false,
}: LogoProps) => {
  const emblemSize = sizes[size];
  const isHero = size === "hero";

  return (
    <div
      className={`flex ${
        isHero ? "flex-col items-center gap-5" : "items-center gap-2.5"
      } shrink-0 ${className}`}
    >
      <Emblem size={emblemSize} />

      {variant === "full" && (
        <div className={`flex flex-col ${isHero ? "items-center gap-2" : "gap-0.5"}`}>
          <span
            className={`tracking-[0.22em] uppercase text-primary font-bold leading-tight ${
              isHero ? "text-2xl" : "text-lg"
            }`}
            style={{ fontFamily: "'Cinzel', serif" }}
          >
            The Chronicle Hub
          </span>

          {showTagline && (
            <span
              className="tracking-[0.35em] uppercase text-muted-foreground text-[0.65rem] font-medium"
              style={{ fontFamily: "'Cinzel', serif" }}
            >
              Let your thoughts shape history
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default ChronicleHubLogo;
