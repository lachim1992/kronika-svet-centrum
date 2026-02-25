interface LogoProps {
  variant?: "full" | "mark";
  className?: string;
  size?: "sm" | "md" | "lg" | "hero";
  showTagline?: boolean;
}

const heights = {
  sm: 36,
  md: 48,
  lg: 80,
  hero: 420,
};

const ChronicleHubLogo = ({
  variant = "full",
  className = "",
  size = "md",
}: LogoProps) => {
  const h = heights[size];
  const isHero = size === "hero";

  return (
    <div className={`shrink-0 ${className}`}>
      <img
        src="/assets/chronicle-logo.png"
        alt="The Chronicle Hub"
        style={{
          height: isHero ? "auto" : h,
          maxWidth: isHero ? `${h}px` : undefined,
          width: isHero ? "100%" : "auto",
        }}
        className="object-contain"
      />
    </div>
  );
};

export default ChronicleHubLogo;
