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
          maxWidth: isHero ? "420px" : undefined,
        }}>
        <img
          alt="The Chronicle Hub"
          className="w-full h-auto object-contain"
          src="/lovable-uploads/3c000f84-809b-4591-b4a4-49a2b0f60acf.png"
        />
      </div>

      {variant === "full" && !isHero && (
        <span
          className="tracking-[0.18em] uppercase text-primary font-bold text-lg"
          style={{ fontFamily: "'Cinzel', serif" }}>
          The Chronicle Hub
        </span>
      )}
    </div>
  );
};

export default ChronicleHubLogo;
