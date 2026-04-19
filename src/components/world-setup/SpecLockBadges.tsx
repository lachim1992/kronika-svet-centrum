// SpecLockBadges — small lock indicator next to a field label.

import { Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  isLocked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  size?: "sm" | "xs";
}

export const SpecLockBadge = ({ isLocked, onToggle, disabled, size = "xs" }: Props) => {
  const Icon = isLocked ? Lock : Unlock;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        size === "xs" ? "h-5 w-5" : "h-6 w-6",
        isLocked ? "text-primary" : "text-muted-foreground/50 hover:text-foreground",
      )}
      title={isLocked ? "Odemknout (povolit AI měnit)" : "Zamknout (AI nepřepíše)"}
    >
      <Icon className={size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5"} />
    </Button>
  );
};
