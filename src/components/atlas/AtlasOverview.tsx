import ProvenanceBadge, { AtlasCard } from "./ProvenanceBadge";
import { PROVENANCE_HINT, type Provenance } from "@/lib/atlas/provenance";

const CYCLE = [
  ["Prostředí a suroviny", "Biom, řeky, pobřeží a průzkumem potvrzená ložiska určují, co lze na polích těžit nebo sbírat."],
  ["Pracovní síla", "Obyvatelé nevyrábějí sami od sebe: dodávají práci do obsazených pracovních míst a zároveň vytvářejí potřeby."],
  ["Výrobní kapacity", "Obsazená pole, budovy a uzly mají jmenovitou kapacitu. Skutečný výstup je menší, pokud chybí práce, vstupy nebo doprava."],
  ["Recepty", "Každý recept mění vstupy na výstup. Suroviny bez vstupů jsou zdroje, ostatní jsou zpracování."],
  ["Zásoby", "Nevyužité skladovatelné zboží zůstává ve městě; podléhavé zboží se kazí."],
  ["Poptávka a spotřební koše", "Domácnosti, armády, stavby, úřady i výroba vytvářejí poptávku po 13 koších. Jen část z nich jsou základní potřeby."],
  ["Ceny a obchod", "Místní cena roste s nedostatkem. Zboží putuje po skutečných cestách, pokud se to po dopravě, mýtech a ztrátách vyplatí."],
  ["Fiskál", "Daně, mzdy a údržbu vypořádává jen uzavření tahu. Atlas nic neplatí ani nepřepočítává."],
];
const TERMS = [
  ["Skutečný výstup", "Kolik se v uzavřeném tahu opravdu vyrobilo."],
  ["Jmenovitá kapacita", "Kolik by zařízení zvládlo při plné práci a vstupech."],
  ["Potenciál", "Co by pole mohlo dát, kdyby bylo obsazeno a obslouženo. Není to výroba."],
  ["Zásoba", "Fyzické zboží ve skladu po spotřebě a ztrátách."],
  ["Příjem", "Peníze, které skutečně přišly; ne hodnota výroby."],
  ["Přidaná hodnota", "Hodnota výstupu minus spotřebované vstupy — tím se měří HDP."],
];

export default function AtlasOverview() {
  return <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
    <AtlasCard title="Jak funguje svět">
      <ol className="space-y-3">
        {CYCLE.map(([t, d], i) => <li key={t} className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/40 text-xs text-primary">{i + 1}</span>
          <div><p className="text-sm font-medium">{t}</p><p className="text-xs text-muted-foreground">{d}</p></div>
        </li>)}
      </ol>
    </AtlasCard>
    <div className="space-y-4">
      <AtlasCard title="Pojmy, které se nezaměňují">
        <dl className="space-y-2">{TERMS.map(([t, d]) => <div key={t}><dt className="text-sm font-medium">{t}</dt><dd className="text-xs text-muted-foreground">{d}</dd></div>)}</dl>
      </AtlasCard>
      <AtlasCard title="Štítky původu čísel">
        <ul className="space-y-2">{(Object.keys(PROVENANCE_HINT) as Provenance[]).map(p => <li key={p} className="flex flex-col gap-1"><ProvenanceBadge status={p} /><span className="text-xs text-muted-foreground">{PROVENANCE_HINT[p]}</span></li>)}</ul>
      </AtlasCard>
    </div>
  </div>;
}
