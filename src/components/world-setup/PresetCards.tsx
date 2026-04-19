import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { WORLD_PRESETS, type PresetId } from "@/lib/worldPresets";

interface PresetCardsProps {
  selected: PresetId;
  onSelect: (id: PresetId) => void;
  disabled?: boolean;
}

export const PresetCards = ({ selected, onSelect, disabled }: PresetCardsProps) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {WORLD_PRESETS.map((preset) => {
        const isActive = selected === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(preset.id)}
            className={cn(
              "text-left transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg",
              disabled && "opacity-50 cursor-not-allowed",
            )}
            aria-pressed={isActive}
          >
            <Card
              className={cn(
                "p-3 h-full border-2 transition-colors",
                isActive
                  ? "border-primary bg-primary/5 shadow-md"
                  : "border-border hover:border-primary/50",
              )}
            >
              <div className="flex items-start gap-2">
                <span className="text-2xl leading-none" aria-hidden>
                  {preset.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">{preset.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 leading-tight">
                    {preset.description}
                  </div>
                </div>
              </div>
            </Card>
          </button>
        );
      })}
    </div>
  );
};
