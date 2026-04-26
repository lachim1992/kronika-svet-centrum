// RulerStep — krok 2 MP wizardu: Vládce / vůdce civilizace.
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Crown } from "lucide-react";

export interface RulerData {
  ruler_name: string;
  ruler_title: string;
  ruler_archetype: string;
  ruler_bio: string;
}

interface Props {
  value: RulerData;
  onChange: (next: RulerData) => void;
}

const ARCHETYPES = [
  { value: "warrior", label: "⚔️ Válečník", desc: "Vojenský vůdce, dobyvatel" },
  { value: "sage", label: "📜 Mudrc", desc: "Učenec, věštec, filosof" },
  { value: "merchant", label: "⚖️ Obchodník", desc: "Pragmatik, vyjednavač" },
  { value: "priest", label: "🕯️ Kněz", desc: "Duchovní autorita" },
  { value: "tyrant", label: "👁️ Tyran", desc: "Strach, kontrola, zlomená vůle" },
  { value: "diplomat", label: "🤝 Diplomat", desc: "Aliance, kompromis, intriky" },
];

const RulerStep = ({ value, onChange }: Props) => {
  return (
    <div className="space-y-3">
      <h3 className="font-display font-semibold text-lg flex items-center gap-2">
        <Crown className="h-5 w-5 text-primary" />
        Vládce civilizace
      </h3>
      <p className="text-xs text-muted-foreground">
        První vládce vaší říše. AI z těchto dat vygeneruje portrét, počáteční rozhodnutí a osobnostní traity.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Jméno vládce *</Label>
          <Input
            value={value.ruler_name}
            onChange={(e) => onChange({ ...value, ruler_name: e.target.value })}
            placeholder="např. Theron"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Titul</Label>
          <Input
            value={value.ruler_title}
            onChange={(e) => onChange({ ...value, ruler_title: e.target.value })}
            placeholder="např. Král, Chán, Dóže..."
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Archetyp vládce</Label>
        <div className="grid grid-cols-2 gap-1.5">
          {ARCHETYPES.map((a) => (
            <button
              key={a.value}
              type="button"
              onClick={() => onChange({ ...value, ruler_archetype: a.value })}
              className={`p-2 rounded border text-left transition-colors ${
                value.ruler_archetype === a.value
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/30"
              }`}
            >
              <div className="text-xs font-semibold">{a.label}</div>
              <div className="text-[10px] text-muted-foreground">{a.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">
          Krátký životopis <span className="text-muted-foreground">(volitelné)</span>
        </Label>
        <Textarea
          value={value.ruler_bio}
          onChange={(e) => onChange({ ...value, ruler_bio: e.target.value })}
          placeholder="Odkud pochází? Jak se dostal/a k moci? Jeden klíčový skutek..."
          rows={3}
          maxLength={500}
        />
        <p className="text-[10px] text-muted-foreground">{value.ruler_bio.length}/500</p>
      </div>
    </div>
  );
};

export default RulerStep;
