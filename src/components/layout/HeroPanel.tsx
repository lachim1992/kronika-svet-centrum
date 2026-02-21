import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import FramePanel from "./FramePanel";

interface HeroPanelProps {
  title?: string;
  headerRight?: ReactNode;
  toolbar?: ReactNode;
  className?: string;
  children: ReactNode;
  aspectRatio?: string;
}

const HeroPanel = ({
  title,
  headerRight,
  toolbar,
  className,
  children,
  aspectRatio = "16/9",
}: HeroPanelProps) => {
  return (
    <FramePanel
      variant="royal"
      title={title}
      headerRight={headerRight}
      noPadding
      className={className}
    >
      <div className="relative" style={{ aspectRatio }}>
        {children}

        {toolbar && (
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
            {toolbar}
          </div>
        )}
      </div>
    </FramePanel>
  );
};

export default HeroPanel;
