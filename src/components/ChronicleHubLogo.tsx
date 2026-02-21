interface LogoProps {
  variant?: "full" | "mark";
  className?: string;
  size?: "sm" | "md" | "lg" | "hero";
}

const sizes = {
  sm: { mark: 28, text: "text-lg" },
  md: { mark: 40, text: "text-2xl" },
  lg: { mark: 64, text: "text-4xl" },
  hero: { mark: 120, text: "text-6xl md:text-7xl" },
};

const ChronicleHubLogo = ({ variant = "full", className = "", size = "md" }: LogoProps) => {
  const s = sizes[size];
  const isHero = size === "hero";

  return (
    <div className={`flex ${isHero ? "flex-col items-center gap-6" : "items-center gap-2.5"} shrink-0 ${className}`}>
      {/* SVG Mark: Book + Crown in circle */}
      <div className={isHero ? "relative" : ""}>
        {/* Glow effect behind logo in hero mode */}
        {isHero && (
          <div
            className="absolute inset-0 rounded-full blur-3xl opacity-20"
            style={{ background: "radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)", transform: "scale(2)" }}
          />
        )}
        <svg
          width={s.mark}
          height={s.mark}
          viewBox="0 0 120 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="shrink-0 relative z-10"
        >
          {/* Outer circle */}
          <circle cx="60" cy="60" r="56" stroke="hsl(var(--primary))" strokeWidth={isHero ? 2 : 3.5} fill="none" />

          {/* Crown */}
          <path
            d="M44 38 L48 30 L52 36 L56 28 L60 36 L64 28 L68 36 L72 30 L76 38 L74 40 L46 40 Z"
            fill="hsl(var(--primary))"
          />
          <rect x="46" y="40" width="28" height="3" rx="1" fill="hsl(var(--primary))" />
          <circle cx="48" cy="30" r="1.5" fill="hsl(var(--primary))" />
          <circle cx="56" cy="28" r="1.5" fill="hsl(var(--primary))" />
          <circle cx="64" cy="28" r="1.5" fill="hsl(var(--primary))" />
          <circle cx="72" cy="30" r="1.5" fill="hsl(var(--primary))" />

          {/* Open Book - Left page */}
          <path
            d="M60 58 C60 58, 58 52, 38 50 L38 80 C58 78, 60 82, 60 82 Z"
            stroke="hsl(var(--primary))"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Right page */}
          <path
            d="M60 58 C60 58, 62 52, 82 50 L82 80 C62 78, 60 82, 60 82 Z"
            stroke="hsl(var(--primary))"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Page lines */}
          <line x1="43" y1="58" x2="56" y2="62" stroke="hsl(var(--primary))" strokeWidth="1" opacity="0.4" />
          <line x1="43" y1="64" x2="56" y2="67" stroke="hsl(var(--primary))" strokeWidth="1" opacity="0.4" />
          <line x1="43" y1="70" x2="56" y2="72" stroke="hsl(var(--primary))" strokeWidth="1" opacity="0.4" />
          <line x1="77" y1="58" x2="64" y2="62" stroke="hsl(var(--primary))" strokeWidth="1" opacity="0.4" />
          <line x1="77" y1="64" x2="64" y2="67" stroke="hsl(var(--primary))" strokeWidth="1" opacity="0.4" />
          <line x1="77" y1="70" x2="64" y2="72" stroke="hsl(var(--primary))" strokeWidth="1" opacity="0.4" />

          {/* Underline flourish */}
          <line x1="42" y1="86" x2="78" y2="86" stroke="hsl(var(--primary))" strokeWidth="2" opacity="0.5" strokeLinecap="round" />
        </svg>
      </div>

      {variant === "full" && (
        <div className={isHero ? "flex flex-col items-center gap-3" : ""}>
          <span
            className={`tracking-[0.2em] uppercase text-primary font-bold ${s.text}`}
            style={{ fontFamily: "'Cinzel', serif" }}
          >
            The Chronicle Hub
          </span>
          {isHero && (
            <span
              className="text-lg md:text-xl tracking-[0.35em] uppercase font-light"
              style={{
                fontFamily: "'Cinzel', serif",
                color: "hsl(var(--primary) / 0.6)",
              }}
            >
              Choose Your Own Destiny
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default ChronicleHubLogo;
