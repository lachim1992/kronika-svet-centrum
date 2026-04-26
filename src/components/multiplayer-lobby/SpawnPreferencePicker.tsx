// SpawnPreferencePicker — preferovaná startovní oblast.
import { Label } from "@/components/ui/label";
import { Compass } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

const PREFS = [
  { value: "any", label: "🎲 Bez preference" },
  { value: "north", label: "⬆️ Sever" },
  { value: "south", label: "⬇️ Jih" },
  { value: "east", label: "➡️ Východ" },
  { value: "west", label: "⬅️ Západ" },
  { value: "coast", label: "🌊 Pobřeží" },
  { value: "inland", label: "🏞️ Vnitrozemí" },
];

const SpawnPreferencePicker = ({ value, onChange }: Props) => {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs flex items-center gap-1.5">
        <Compass className="h-3.5 w-3.5 text-primary" />
        Preferovaná startovní oblast
      </Label>
      <div className="grid grid-cols-4 gap-1">
        {PREFS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => onChange(p.value)}
            className={`p-1.5 rounded border text-[10px] transition ${
              value === p.value
                ? "border-primary bg-primary/10"
                : "border-border hover:border-primary/30"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Engine se pokusí preferenci dodržet, ale není zaručena (záleží na mapě a ostatních hráčích).
      </p>
    </div>
  );
};

export default SpawnPreferencePicker;
