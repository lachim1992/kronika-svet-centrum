// SecretObjectiveStep — krok 6 MP wizardu: výběr archetypu tajného cíle.
import { Label } from "@/components/ui/label";
import { Target } from "lucide-react";

export interface SecretObjectiveData {
  secret_objective_archetype: string;
}

interface Props {
  value: SecretObjectiveData;
  onChange: (next: SecretObjectiveData) => void;
}

const ARCHETYPES = [
  {
    value: "conqueror",
    label: "🗡️ Dobyvatel",
    desc: "Ovládnout určité regiony silou, porazit konkrétní rivaly.",
  },
  {
    value: "merchant_prince",
    label: "💰 Obchodní princ",
    desc: "Dominovat klíčovým obchodním uzlům a koridorům.",
  },
  {
    value: "prophet",
    label: "🕯️ Prorok",
    desc: "Rozšířit svou víru, obrátit cizí města, postavit svaté divy.",
  },
  {
    value: "librarian",
    label: "📚 Knihovník",
    desc: "Sebrat artefakty, zmapovat svět, odhalit pradávná tajemství.",
  },
  {
    value: "kingmaker",
    label: "🎭 Kralotvůrce",
    desc: "Manipulovat ostatní hráče skrze diplomacii a tajné dohody.",
  },
];

const SecretObjectiveStep = ({ value, onChange }: Props) => {
  return (
    <div className="space-y-3">
      <h3 className="font-display font-semibold text-lg flex items-center gap-2">
        <Target className="h-5 w-5 text-primary" />
        Tajný cíl
      </h3>
      <p className="text-xs text-muted-foreground">
        Vyberte archetyp své skryté ambice. AI z něj při startu vygeneruje konkrétní cíl, který znáte
        jen vy a který vám dává alternativní cestu k vítězství.
      </p>

      <div className="space-y-1.5">
        <Label className="text-xs">Archetyp cíle</Label>
        <div className="grid grid-cols-1 gap-1.5">
          {ARCHETYPES.map((a) => (
            <button
              key={a.value}
              type="button"
              onClick={() => onChange({ secret_objective_archetype: a.value })}
              className={`p-2.5 rounded border text-left transition-colors ${
                value.secret_objective_archetype === a.value
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/30"
              }`}
            >
              <div className="text-sm font-semibold">{a.label}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{a.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SecretObjectiveStep;
