import logoImage from "@/assets/chronicle-hub-logo.png";

interface LogoProps {
  variant?: "full" | "mark";
  className?: string;
  size?: "sm" | "md" | "lg" | "hero";
}

const sizes = {
  sm: 32,
  md: 48,
  lg: 80,
  hero: 320,
};

const ChronicleHubLogo = ({ variant = "full", className = "", size = "md" }: LogoProps) => {
  const imgSize = sizes[size];
  const isHero = size === "hero";

  return (
    <div className={`flex ${isHero ? "flex-col items-center" : "items-center gap-2.5"} shrink-0 ${className}`}>
      {/* Logo image with mask to blend into any dark background */}
      <div
        className="relative shrink-0"
        style={{
          width: imgSize,
          height: isHero ? "auto" : imgSize,
          maxWidth: isHero ? "320px" : undefined,
        }}
      >
        {/* Subtle radial glow behind logo in hero mode */}
        {isHero && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(circle, hsl(43 64% 52% / 0.08) 0%, transparent 70%)",
              transform: "scale(1.5)",
              filter: "blur(20px)",
            }}
          />
        )}
        <img
          src={logoImage}
          alt="The Chronicle Hub"
          className="relative z-10 w-full h-auto object-contain"
          style={{
            mixBlendMode: "screen",
            filter: isHero ? undefined : "brightness(1.1)",
          }}
        />
      </div>

      {/* Text label for non-hero inline usage */}
      {variant === "full" && !isHero && (
        <span
          className="tracking-[0.18em] uppercase text-primary font-bold text-lg"
          style={{ fontFamily: "'Cinzel', serif" }}
        >
          The Chronicle Hub
        </span>
      )}
    </div>
  );
};

export default ChronicleHubLogo;
