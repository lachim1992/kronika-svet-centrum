import { cn } from "@/lib/utils";
import { ReactNode } from "react";

type FrameVariant = "parchment" | "stone" | "royal";

interface FramePanelProps {
  variant?: FrameVariant;
  className?: string;
  children: ReactNode;
  title?: string;
  headerRight?: ReactNode;
  noPadding?: boolean;
}

const variantStyles: Record<FrameVariant, string> = {
  parchment: [
    "bg-card border border-border",
    "shadow-[inset_0_1px_0_0_hsl(var(--primary)/0.08),0_4px_24px_-8px_hsl(216_50%_5%/0.4)]",
    "before:absolute before:inset-0 before:rounded-[inherit] before:pointer-events-none",
    "before:bg-[linear-gradient(180deg,hsl(35_30%_22%/0.08)_0%,transparent_40%)]",
  ].join(" "),
  stone: [
    "bg-secondary border border-border",
    "shadow-[inset_0_2px_0_0_hsl(215_35%_28%/0.3),0_4px_20px_-6px_hsl(216_50%_5%/0.5)]",
  ].join(" "),
  royal: [
    "bg-card border border-primary/20",
    "shadow-[inset_0_1px_0_0_hsl(var(--primary)/0.12),0_4px_24px_-8px_hsl(216_50%_5%/0.5)]",
    "ring-1 ring-inset ring-primary/5",
  ].join(" "),
};

const FramePanel = ({
  variant = "parchment",
  className,
  children,
  title,
  headerRight,
  noPadding = false,
}: FramePanelProps) => {
  return (
    <section
      className={cn(
        "relative rounded-xl overflow-hidden",
        variantStyles[variant],
        className
      )}
    >
      {/* Corner ornaments */}
      <Ornament position="top-left" />
      <Ornament position="top-right" />
      <Ornament position="bottom-left" />
      <Ornament position="bottom-right" />

      {/* Inner border line */}
      <div className="absolute inset-[3px] rounded-[10px] border border-primary/[0.07] pointer-events-none z-[1]" />

      {title && (
        <div className="relative z-[2] flex items-center justify-between px-5 pt-4 pb-2">
          <h3 className="font-display text-sm font-semibold tracking-wide text-primary uppercase">
            {title}
          </h3>
          {headerRight}
        </div>
      )}

      <div className={cn("relative z-[2]", !noPadding && "p-5", title && !noPadding && "pt-2")}>
        {children}
      </div>
    </section>
  );
};

/* Subtle corner ornament SVG */
const Ornament = ({ position }: { position: string }) => {
  const posClasses: Record<string, string> = {
    "top-left": "top-0 left-0",
    "top-right": "top-0 right-0 -scale-x-100",
    "bottom-left": "bottom-0 left-0 -scale-y-100",
    "bottom-right": "bottom-0 right-0 -scale-x-100 -scale-y-100",
  };

  return (
    <svg
      className={cn(
        "absolute w-6 h-6 text-primary/15 pointer-events-none z-[2]",
        posClasses[position]
      )}
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M0 0 L8 0 Q4 4 0 8 Z"
        fill="currentColor"
      />
      <path
        d="M0 0 L12 0 M0 0 L0 12"
        stroke="currentColor"
        strokeWidth="0.5"
        opacity="0.5"
      />
    </svg>
  );
};

export default FramePanel;
