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
  hero: 420
};

const ChronicleHubLogo = ({ variant = "full", className = "", size = "md" }: LogoProps) => {
  const imgSize = sizes[size];
  const isHero = size === "hero";

  return (
    <div className={`flex ${isHero ? "flex-col items-center" : "items-center gap-2.5"} shrink-0 ${className}`}>
      <div
        className="relative shrink-0"
        style={{
          width: isHero ? undefined : imgSize,
          height: isHero ? "auto" : imgSize,
          maxWidth: isHero ? "420px" : undefined
        }}>

        {isHero &&
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(circle, hsl(43 64% 52% / 0.08) 0%, transparent 70%)",
            transform: "scale(1.5)",
            filter: "blur(20px)"
          }} />

        }
        <img
          alt="The Chronicle Hub"
          className="relative z-10 w-full h-auto object-contain"
          style={{
            mixBlendMode: "screen",
            filter: isHero ? "brightness(1.05) drop-shadow(0 0 40px hsl(43 64% 52% / 0.15))" : "brightness(1.1)",
            opacity: isHero ? 0.92 : 1,
            maskImage: isHero ? "radial-gradient(ellipse 85% 80% at 50% 45%, black 50%, transparent 100%)" : undefined,
            WebkitMaskImage: isHero ? "radial-gradient(ellipse 85% 80% at 50% 45%, black 50%, transparent 100%)" : undefined,
          }} src="/lovable-uploads/3c000f84-809b-4591-b4a4-49a2b0f60acf.png" />

      </div>

      {variant === "full" && !isHero &&
      <span
        className="tracking-[0.18em] uppercase text-primary font-bold text-lg"
        style={{ fontFamily: "'Cinzel', serif" }}>

          The Chronicle Hub
        </span>
      }
    </div>);

};

export default ChronicleHubLogo;