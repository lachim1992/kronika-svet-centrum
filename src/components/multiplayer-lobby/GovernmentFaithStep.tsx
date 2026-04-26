// GovernmentFaithStep — krok 4 MP wizardu: vládní forma + obchodní ideologie + víra.
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Landmark, Coins, Flame } from "lucide-react";

export interface GovernmentFaithData {
  government_form: string;
  trade_ideology: string;
  dominant_faith: string;
  faith_attitude: string;
}

interface Props {
  value: GovernmentFaithData;
  onChange: (next: GovernmentFaithData) => void;
}

const GOVERNMENTS = [
  { value: "monarchy", label: "👑 Monarchie", desc: "Jeden vládce, dědičnost" },
  { value: "republic", label: "🏛️ Republika", desc: "Rada, volby, mandáty" },
  { value: "theocracy", label: "🕯️ Teokracie", desc: "Vláda kněžstva" },
  { value: "oligarchy", label: "💼 Oligarchie", desc: "Vláda několika rodů/cechů" },
  { value: "tribal", label: "🦌 Kmenová", desc: "Náčelník + rada starších" },
  { value: "magocracy", label: "🔮 Magokracie", desc: "Vláda mágů / učenců" },
];

const TRADE_IDEOLOGIES = [
  { value: "free_market", label: "📈 Volný trh", desc: "Liberální obchod, nízké cla" },
  { value: "guilds", label: "⚒️ Cechovní systém", desc: "Regulované řemeslo, kvalita" },
  { value: "palace_economy", label: "🏰 Palácové hospodářství", desc: "Stát řídí toky" },
];

const FAITH_ATTITUDES = [
  { value: "tolerant", label: "🌿 Tolerantní" },
  { value: "syncretic", label: "🌀 Synkretická" },
  { value: "orthodox", label: "📿 Ortodoxní" },
  { value: "militant", label: "🔥 Militantní" },
];

const GovernmentFaithStep = ({ value, onChange }: Props) => {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs flex items-center gap-1.5">
          <Landmark className="h-3.5 w-3.5 text-primary" />
          Vládní forma
        </Label>
        <div className="grid grid-cols-2 gap-1.5">
          {GOVERNMENTS.map((g) => (
            <button
              key={g.value}
              type="button"
              onClick={() => onChange({ ...value, government_form: g.value })}
              className={`p-2 rounded border text-left transition-colors ${
                value.government_form === g.value
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/30"
              }`}
            >
              <div className="text-xs font-semibold">{g.label}</div>
              <div className="text-[10px] text-muted-foreground">{g.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs flex items-center gap-1.5">
          <Coins className="h-3.5 w-3.5 text-primary" />
          Obchodní ideologie
        </Label>
        <div className="grid grid-cols-1 gap-1.5">
          {TRADE_IDEOLOGIES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => onChange({ ...value, trade_ideology: t.value })}
              className={`p-2 rounded border text-left transition-colors ${
                value.trade_ideology === t.value
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/30"
              }`}
            >
              <div className="text-xs font-semibold">{t.label}</div>
              <div className="text-[10px] text-muted-foreground">{t.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs flex items-center gap-1.5">
          <Flame className="h-3.5 w-3.5 text-primary" />
          Dominantní víra
        </Label>
        <Input
          value={value.dominant_faith}
          onChange={(e) => onChange({ ...value, dominant_faith: e.target.value })}
          placeholder="např. Kult Slunce, Cesta tří pravd, Ohňové bratrstvo..."
        />
        <div className="grid grid-cols-4 gap-1.5">
          {FAITH_ATTITUDES.map((a) => (
            <button
              key={a.value}
              type="button"
              onClick={() => onChange({ ...value, faith_attitude: a.value })}
              className={`p-1.5 rounded border text-[10px] transition-colors ${
                value.faith_attitude === a.value
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/30"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default GovernmentFaithStep;
