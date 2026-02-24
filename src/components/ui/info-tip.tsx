import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface InfoTipProps {
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}

/**
 * Reusable info tooltip icon. Wrap any explanation text inside.
 * Usage: <InfoTip>Explanation text here</InfoTip>
 */
export function InfoTip({ children, side = "top", className }: InfoTipProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className={`h-3 w-3 text-muted-foreground/50 cursor-help inline-flex shrink-0 ${className || ""}`} />
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-[280px] text-xs">
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
