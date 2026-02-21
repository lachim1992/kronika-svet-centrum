import { Badge } from "@/components/ui/badge";
import { Info, Zap, Clock, Database } from "lucide-react";

const EVENT_TYPES = [
  { type: "famine", trigger: "grain_net < 0 (deficit obilí)", system: "LocalSimulation / process-turn", deterministic: true, desc: "Spouští se při negativní bilanci obilí. Závažnost závisí na velikosti deficitu." },
  { type: "harvest", trigger: "grain_net > 0 (přebytek)", system: "LocalSimulation / process-turn", deterministic: true, desc: "Pozitivní bilance obilí generuje událost bohaté úrody." },
  { type: "growth", trigger: "grain_net > 20 (vysoký přebytek)", system: "LocalSimulation", deterministic: true, desc: "Výrazný přebytek potravin vede k růstu populace a prosperitě." },
  { type: "construction", trigger: "Náhodné v simulaci (1-3/rok)", system: "LocalSimulation", deterministic: false, desc: "Náhodně generováno jako městská událost. Nemá mechanický trigger." },
  { type: "dispute", trigger: "Náhodné v simulaci", system: "LocalSimulation", deterministic: false, desc: "Náhodně generovaný spor. V budoucnu by mohl záviset na stabilitě." },
  { type: "trade", trigger: "Náhodné v simulaci", system: "LocalSimulation", deterministic: false, desc: "Obchodní událost generovaná náhodně z městských šablon." },
  { type: "military", trigger: "Fixní roky (rok 5, 9 simulace)", system: "LocalSimulation", deterministic: true, desc: "Vojenská hrozba na pevných pozicích v simulačním cyklu." },
  { type: "crisis", trigger: "stability < 40 (rok 6 simulace)", system: "LocalSimulation", deterministic: true, desc: "Nízká stabilita říše vyvolá nepokoje ve městě." },
  { type: "plague", trigger: "Definováno v šablonách, zatím nepoužito v simulaci", system: "—", deterministic: false, desc: "Šablona existuje, ale aktuální simulace ji nespouští automaticky." },
  { type: "discovery", trigger: "Náhodné v simulaci", system: "LocalSimulation", deterministic: false, desc: "Náhodný objev generovaný jako městská událost." },
  { type: "festival", trigger: "Náhodné v simulaci", system: "LocalSimulation", deterministic: false, desc: "Festivalová událost bez mechanického triggeru." },
];

const EventEngineSection = () => {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Info className="h-4 w-4 text-primary" />
        <h3 className="font-display font-semibold text-sm">Event Engine Overview</h3>
      </div>

      <div className="text-xs text-muted-foreground space-y-2 p-3 rounded-lg bg-secondary/20 border border-border">
        <p className="flex items-center gap-1.5">
          <Zap className="h-3 w-3 text-primary" />
          <strong>Systémy generující události:</strong>
        </p>
        <ul className="pl-5 space-y-1 list-disc marker:text-primary/50">
          <li><code className="text-[10px] bg-muted px-1 rounded">LocalSimulation</code> — klientská simulace 10 let, zapisuje do <code className="text-[10px] bg-muted px-1 rounded">game_events</code></li>
          <li><code className="text-[10px] bg-muted px-1 rounded">process-turn</code> — serverová edge funkce pro zpracování kola</li>
          <li><code className="text-[10px] bg-muted px-1 rounded">process-tick</code> — automatický tick pro real-time akce</li>
          <li><code className="text-[10px] bg-muted px-1 rounded">world-crisis</code> — globální krizové události</li>
        </ul>
        <p className="flex items-center gap-1.5 mt-2">
          <Database className="h-3 w-3 text-primary" />
          Události se ukládají do tabulky <code className="text-[10px] bg-muted px-1 rounded">game_events</code> s flagy <code className="text-[10px] bg-muted px-1 rounded">confirmed</code> a <code className="text-[10px] bg-muted px-1 rounded">truth_state</code>.
        </p>
        <p className="flex items-center gap-1.5">
          <Clock className="h-3 w-3 text-primary" />
          Přidání do kroniky/ságy vyžaduje <code className="text-[10px] bg-muted px-1 rounded">confirmed=true</code> a <code className="text-[10px] bg-muted px-1 rounded">truth_state='canon'</code>.
        </p>
      </div>

      <div className="rounded-lg overflow-hidden border border-border">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-secondary/40">
              <th className="text-left p-2 font-display">Typ</th>
              <th className="text-left p-2 font-display">Trigger</th>
              <th className="text-left p-2 font-display">Systém</th>
              <th className="text-left p-2 font-display">Det.</th>
            </tr>
          </thead>
          <tbody>
            {EVENT_TYPES.map(e => (
              <tr key={e.type} className="border-t border-border hover:bg-secondary/20">
                <td className="p-2 font-mono font-semibold">{e.type}</td>
                <td className="p-2 text-muted-foreground">{e.trigger}</td>
                <td className="p-2"><Badge variant="outline" className="text-[9px]">{e.system}</Badge></td>
                <td className="p-2">{e.deterministic ? "✅" : "🎲"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-muted-foreground italic">
        Det. = Deterministické (závislé na herních datech) vs. Náhodné (šablonové, bez mechanického triggeru).
      </p>
    </div>
  );
};

export default EventEngineSection;
