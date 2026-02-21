import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import FramePanel from "./FramePanel";

interface TablePanelProps {
  title?: string;
  headerRight?: ReactNode;
  maxHeight?: string;
  className?: string;
  children: ReactNode;
}

const TablePanel = ({
  title,
  headerRight,
  maxHeight = "280px",
  className,
  children,
}: TablePanelProps) => {
  return (
    <FramePanel
      variant="stone"
      title={title}
      headerRight={headerRight}
      noPadding
      className={className}
    >
      <div
        className={cn("overflow-x-auto overflow-y-auto scrollbar-hide")}
        style={{ maxHeight }}
      >
        {children}
      </div>
    </FramePanel>
  );
};

export default TablePanel;
