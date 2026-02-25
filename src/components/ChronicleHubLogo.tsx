import logoImage from "@/assets/chronicle-hub-logo.png";

interface LogoProps {
  variant?: "full" | "mark";
  className?: string;
  size?: "sm" | "md" | "lg" | "hero";
}

const sizes = {
  sm: { img: 32, text: "text-lg" },
  md: { img: 48, text: "text-2xl" },
  lg: { img: 80, text: "text-4xl" },
  hero: { img: 280, text: "text-6xl md:text-7xl" },
};

const ChronicleHubLogo = ({ variant = "full", className = "", size = "md" }: LogoProps) => {
  const s = sizes[size];
  const isHero = size === "hero";

  return (
    <div className={`flex ${isHero ? "flex-col items-center gap-2" : "items-center gap-2.5"} shrink-0 ${className}`}>
      <img
        src={logoImage}
        alt="The Chronicle Hub"
        width={s.img}
        height={isHero ? undefined : s.img}
        className={`shrink-0 object-contain ${isHero ? "max-w-[280px] w-full" : ""}`}
        style={!isHero ? { width: s.img, height: s.img } : undefined}
      />

      {variant === "full" && !isHero && (
        <span
          className={`tracking-[0.2em] uppercase text-primary font-bold ${s.text}`}
          style={{ fontFamily: "'Cinzel', serif" }}
        >
          The Chronicle Hub
        </span>
      )}
    </div>
  );
};

export default ChronicleHubLogo;
