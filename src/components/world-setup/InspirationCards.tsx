// Inspiration cards — premise starter prompts.
// Selecting a card sets the premise textarea value but does NOT auto-analyze.

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface InspirationCard {
  id: string;
  label: string;
  icon: string;
  description: string;
  premise: string;
}

export const INSPIRATION_CARDS: InspirationCard[] = [
  {
    id: "great_continent",
    label: "Velký kontinent",
    icon: "🗻",
    description: "Jediná pevnina, sousedské hranice, horské průsmyky.",
    premise:
      "Jediná velká pevnina pod nebesy. Říše rostou bok po boku, hory dělí kultury a každá řeka tvoří přirozenou hranici. Konflikt o úrodná údolí a obchodní cesty určuje osud národů.",
  },
  {
    id: "archipelago",
    label: "Souostroví",
    icon: "🏝️",
    description: "Roztroušené ostrovy, námořní obchod a expanze.",
    premise:
      "Stovky ostrovů spojené mořskými cestami. Každá zátoka skrývá obchod, pirátství nebo zapomenutý chrám. Lodě jsou hlavní silou — kdo ovládá moře, ovládá svět.",
  },
  {
    id: "mythic_dawn",
    label: "Mýtický úsvit",
    icon: "🌅",
    description: "Mladý svět, bohové ještě chodí mezi smrtelníky.",
    premise:
      "Mladý svět na úsvitu civilizací. Národy se teprve usazují, hranice jsou neostré a budoucnost otevřená. Bohové ještě chodí po zemi a každý hrdina může změnit dějiny.",
  },
];

interface Props {
  selected: string | null;
  onSelect: (card: InspirationCard) => void;
  disabled?: boolean;
}

export const InspirationCards = ({ selected, onSelect, disabled }: Props) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {INSPIRATION_CARDS.map((card) => {
        const active = selected === card.id;
        return (
          <button
            key={card.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(card)}
            className={cn(
              "text-left transition-all rounded-lg",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              disabled && "opacity-50 cursor-not-allowed",
            )}
            aria-pressed={active}
          >
            <Card
              className={cn(
                "p-3 h-full border-2 transition-colors",
                active
                  ? "border-primary bg-primary/5 shadow-md"
                  : "border-border hover:border-primary/50",
              )}
            >
              <div className="flex items-start gap-2">
                <span className="text-2xl leading-none" aria-hidden>
                  {card.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">{card.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 leading-tight">
                    {card.description}
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
