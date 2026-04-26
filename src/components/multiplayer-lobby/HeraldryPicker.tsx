// HeraldryPicker — vizuální identita říše: dvě barvy + symbol.
import { Label } from "@/components/ui/label";
import { Shield } from "lucide-react";

export interface HeraldryData {
  primary: string;
  secondary: string;
  symbol: string;
}

interface Props {
  value: HeraldryData;
  onChange: (next: HeraldryData) => void;
}

const COLORS = [
  "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#0d9488",
  "#0891b2", "#2563eb", "#7c3aed", "#c026d3", "#9333ea",
  "#1e293b", "#475569", "#e2e8f0", "#fef3c7", "#fef08a",
];

const SYMBOLS = [
  { id: "circle", label: "⬤" },
  { id: "cross", label: "✚" },
  { id: "star", label: "★" },
  { id: "wolf", label: "🐺" },
  { id: "eagle", label: "🦅" },
  { id: "lion", label: "🦁" },
  { id: "dragon", label: "🐉" },
  { id: "tree", label: "🌳" },
  { id: "sun", label: "☀️" },
  { id: "moon", label: "🌙" },
  { id: "rune", label: "ᛟ" },
  { id: "anchor", label: "⚓" },
];

const HeraldryPicker = ({ value, onChange }: Props) => {
  const symbol = SYMBOLS.find((s) => s.id === value.symbol)?.label || "⬤";

  return (
    <div className="space-y-3 rounded-lg border border-border p-3 bg-card/50">
      <Label className="text-xs flex items-center gap-1.5">
        <Shield className="h-3.5 w-3.5 text-primary" />
        Heraldika (vlajka říše)
      </Label>

      <div className="flex items-center gap-3">
        {/* Preview */}
        <div
          className="h-20 w-20 rounded-md flex items-center justify-center text-3xl shrink-0 border-2"
          style={{
            background: `linear-gradient(135deg, ${value.primary} 0%, ${value.primary} 60%, ${value.secondary} 60%, ${value.secondary} 100%)`,
            borderColor: value.secondary,
          }}
        >
          {symbol}
        </div>

        <div className="flex-1 space-y-2">
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Primární barva</p>
            <div className="flex flex-wrap gap-1">
              {COLORS.map((c) => (
                <button
                  key={`p-${c}`}
                  type="button"
                  onClick={() => onChange({ ...value, primary: c })}
                  className={`h-5 w-5 rounded border-2 transition ${
                    value.primary === c ? "border-foreground scale-110" : "border-transparent"
                  }`}
                  style={{ background: c }}
                  aria-label={`Primární ${c}`}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Sekundární barva</p>
            <div className="flex flex-wrap gap-1">
              {COLORS.map((c) => (
                <button
                  key={`s-${c}`}
                  type="button"
                  onClick={() => onChange({ ...value, secondary: c })}
                  className={`h-5 w-5 rounded border-2 transition ${
                    value.secondary === c ? "border-foreground scale-110" : "border-transparent"
                  }`}
                  style={{ background: c }}
                  aria-label={`Sekundární ${c}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div>
        <p className="text-[10px] text-muted-foreground mb-1">Symbol</p>
        <div className="grid grid-cols-6 gap-1">
          {SYMBOLS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onChange({ ...value, symbol: s.id })}
              className={`h-9 rounded border text-xl transition ${
                value.symbol === s.id
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/30"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HeraldryPicker;
