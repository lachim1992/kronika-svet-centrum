// LineageSelector — Wizard krok pro výběr pradávných rodů (v9.1).
//
// Hráč vybere 3 z 5–8 AI-navržených lineage_candidates. Default = první 3.
// Komponenta také zobrazí reset_event jako prequel a mythic_seeds jako mini hex grid.

import { useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, ScrollText, Hexagon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AncientLayerSpec, LineageProposal } from "@/types/ancientLayer";

interface Props {
  ancientLayer: AncientLayerSpec;
  selected: string[];
  onChange: (next: string[]) => void;
  maxSelectable?: number;
}

const MYTHIC_TAG_LABEL: Record<string, string> = {
  ruin: "Ruina",
  altar: "Oltář",
  leyline_node: "Uzel sil",
  drowned_gate: "Utopená brána",
  watchstone: "Strážný kámen",
  ash_pit: "Popelová jáma",
  obelisk: "Obelisk",
  broken_tower: "Zlomená věž",
};

export const LineageSelector = ({
  ancientLayer,
  selected,
  onChange,
  maxSelectable = 3,
}: Props) => {
  // Default selection on first render
  useEffect(() => {
    if (selected.length === 0 && ancientLayer.lineage_candidates.length > 0) {
      onChange(ancientLayer.lineage_candidates.slice(0, maxSelectable).map((l) => l.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ancientLayer.lineage_candidates]);

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((x) => x !== id));
    } else if (selected.length < maxSelectable) {
      onChange([...selected, id]);
    } else {
      // Replace oldest
      onChange([...selected.slice(1), id]);
    }
  };

  const sortedSeeds = useMemo(
    () => [...ancientLayer.mythic_seeds].sort((a, b) => a.tag.localeCompare(b.tag)),
    [ancientLayer.mythic_seeds],
  );

  return (
    <div className="space-y-6">
      {/* Reset event — prequel */}
      <Card className="p-5 bg-gradient-to-br from-muted/40 to-muted/10 border-l-4 border-l-primary">
        <div className="flex items-start gap-3">
          <ScrollText className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="font-serif text-lg font-semibold">Pradávný zlom</h3>
              <Badge variant="outline" className="font-mono text-xs">
                {ancientLayer.reset_event.type}
              </Badge>
              <span className="text-xs text-muted-foreground">
                před {Math.abs(ancientLayer.reset_event.turn_offset)} koly
              </span>
            </div>
            <p className="text-sm text-muted-foreground italic leading-relaxed">
              {ancientLayer.reset_event.description}
            </p>
          </div>
        </div>
      </Card>

      {/* Lineage selection */}
      <div>
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="font-serif text-lg font-semibold">Pradávné rody</h3>
          <span className="text-sm text-muted-foreground">
            Vyberte {maxSelectable} ({selected.length}/{maxSelectable})
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ancientLayer.lineage_candidates.map((lineage: LineageProposal) => {
            const isSelected = selected.includes(lineage.id);
            return (
              <button
                key={lineage.id}
                type="button"
                onClick={() => toggle(lineage.id)}
                className={cn(
                  "text-left p-4 rounded-lg border-2 transition-all",
                  "hover:border-primary/60 hover:bg-accent/40",
                  isSelected
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border bg-card",
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h4 className="font-semibold text-base">{lineage.name}</h4>
                  {isSelected && (
                    <div className="shrink-0 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                      <Check className="h-3 w-3 text-primary-foreground" />
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed mb-2">
                  {lineage.description}
                </p>
                {lineage.cultural_anchor && (
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    {lineage.cultural_anchor}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mythic seeds preview */}
      {sortedSeeds.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="font-serif text-lg font-semibold">Pozůstatky starého řádu</h3>
            <span className="text-sm text-muted-foreground">{sortedSeeds.length} míst</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {sortedSeeds.map((seed) => (
              <Card key={seed.id} className="p-3 text-center">
                <Hexagon className="h-5 w-5 text-muted-foreground mx-auto mb-1" />
                <div className="text-xs font-medium">
                  {MYTHIC_TAG_LABEL[seed.tag] ?? seed.tag}
                </div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  ({seed.hex_q}, {seed.hex_r})
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
