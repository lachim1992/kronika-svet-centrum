import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

const FORMULA_SECTIONS = [
  {
    title: "⚒️ Produkce uzlů",
    formulas: [
      { name: "Základní produkce", formula: "base[node_type] × role_mult × (1 − isolation)" },
      { name: "Base dle typu", detail: "resource_node=8, village=6, port=5, city=4, secondary=3, logistic=3, trade_hub=2, religious=2, fortress=1" },
      { name: "Role multiplikátor", detail: "hub=0.8, gateway=0.9, regulator=0.7, producer=1.2, neutral=1.0" },
      { name: "Workforce penalizace", formula: "produkce × effective_workforce_ratio" },
      { name: "Over-mobilization", formula: "penalty = (mob_rate − max_mob) × 2, max 80%" },
    ],
  },
  {
    title: "💰 Bohatství (Wealth)",
    formulas: [
      { name: "Trade efficiency", formula: "produkce_průtok × trade_eff[role]" },
      { name: "Trade eff. dle role", detail: "hub=1.0, gateway=0.8, regulator=0.6, producer=0.3, neutral=0.2" },
      { name: "Městský příjem", formula: "settlement_base + pop/500 + burghers/200" },
      { name: "Settlement base", detail: "HAMLET=1, TOWNSHIP=2, CITY=4, POLIS=6" },
      { name: "Prestiž bonus", formula: "+0.1% wealth za každý bod celkové prestiže" },
    ],
  },
  {
    title: "🌾 Zásoby (Grain)",
    formulas: [
      { name: "Produkce", formula: "rolníci × irrigation_level × ration_policy_mult" },
      { name: "Spotřeba", formula: "populace × 0.006 za kolo" },
      { name: "Bilance", formula: "produkce − spotřeba → grain_reserve" },
      { name: "Kapacita sýpky", detail: "Základní 100 + granary budovy. Přebytek nad kapacitou se ztrácí." },
      { name: "Hladomor", detail: "Nastává po vyčerpání grain_reserve při záporné bilanci. Zvyšuje death_rate, snižuje stabilitu." },
    ],
  },
  {
    title: "👥 Populace",
    formulas: [
      { name: "Růst", formula: "base_rate (1.2%) × food_surplus × stability × housing" },
      { name: "food_surplus", detail: "1.0 pokud zásoby > 0, klesá exponenciálně při deficitu" },
      { name: "stability multiplikátor", detail: "city_stability / 100. Pod 30% = velmi nízký růst" },
      { name: "housing multiplikátor", detail: "min(1.0, housing_capacity / population)" },
      { name: "Rozložení růstu", detail: "Rolníci 55%, Měšťané 20%+market_level, Klerici 10%+temple_level, Válečníci zbytek dle garrison" },
      { name: "Povýšení sídla", detail: "Automaticky: 100→Vesnice, 500→Městečko, 2000→Město, 8000→Velké město, 20000→Polis" },
    ],
  },
  {
    title: "🛡️ Stabilita",
    formulas: [
      { name: "Základ", detail: "50% — výchozí stabilita nově založeného města" },
      { name: "Hladomor", formula: "−5% za každé kolo hladomoru, kumulativní" },
      { name: "Víra bonus", formula: "+0.2% za bod víry" },
      { name: "Overcrowding", formula: "−penalty pokud populace > housing_capacity" },
      { name: "Rebelie", detail: "Stabilita pod 30% aktivuje riziko povstání. Pod 15% = téměř jisté." },
    ],
  },
  {
    title: "⛪ Víra",
    formulas: [
      { name: "Generace od kleriků", formula: "Σ(klerici) × 0.01 za kolo" },
      { name: "Generace od chrámů", formula: "Σ(temple_level) × 0.5 za kolo" },
      { name: "Morálka vojska", formula: "+0.5% morálky za bod víry" },
      { name: "Stabilita bonus", formula: "+0.2% city_stability za bod víry" },
    ],
  },
  {
    title: "⚔️ Vojenská údržba",
    formulas: [
      { name: "Zlatá údržba", formula: "⌈manpower / 100⌉ gold za kolo" },
      { name: "Potravinová údržba", formula: "⌈manpower / 500⌉ zásob za kolo" },
      { name: "Mobilizace", formula: "mobilized = active_pop × mobilization_rate" },
      { name: "Active pop", formula: "peasants×1.0 + burghers×0.7 + clerics×0.2" },
    ],
  },
  {
    title: "🔗 Síťový tok (Province Graph)",
    formulas: [
      { name: "Izolační penalizace", detail: "A* pathfinding od uzlu k hlavnímu městu. Nenalezená cesta = 100% izolace" },
      { name: "Severity", detail: "<15% mírná, 15-35% částečná, 35-55% těžká, >55% odříznuto" },
      { name: "Importance skóre", formula: "produkce × konektivita × role_mult" },
      { name: "Incoming production", detail: "Minor uzly posílají 50% produkce do nadřazeného major uzlu" },
    ],
  },
];

const FormulasReferencePanel = () => {
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          📐 Vzorce & mechaniky — kompletní reference
          <InfoTip>Všechny klíčové vzorce simulace na jednom místě. Tyto výpočty probíhají na serveru v edge funkcích process-turn a compute-economy-flow.</InfoTip>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-1 space-y-1">
        {FORMULA_SECTIONS.map(section => (
          <Collapsible key={section.title}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 w-full text-left text-xs font-semibold py-2 px-2 rounded hover:bg-muted/50 transition-colors">
                <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                {section.title}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pl-7 pb-3 space-y-1.5">
              {section.formulas.map((f, i) => (
                <div key={i} className="text-xs space-y-0.5">
                  <div className="flex items-start gap-2">
                    <span className="font-semibold text-foreground whitespace-nowrap">{f.name}:</span>
                    {f.formula && (
                      <code className="text-[10px] font-mono bg-muted/60 rounded px-1.5 py-0.5 text-primary">
                        {f.formula}
                      </code>
                    )}
                  </div>
                  {f.detail && (
                    <p className="text-[10px] text-muted-foreground pl-2">{f.detail}</p>
                  )}
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        ))}
      </CardContent>
    </Card>
  );
};

export default FormulasReferencePanel;
