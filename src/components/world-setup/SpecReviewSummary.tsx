// SpecReviewSummary — read-only top-level summary of resolved spec.
// Shown above the editor to give an at-a-glance preview of what AI proposed.

import { Badge } from "@/components/ui/badge";
import type { WorldgenSpecV1 } from "@/types/worldBootstrap";

interface Props {
  resolved: WorldgenSpecV1;
  warnings: Array<{ code: string; message: string; field?: string }>;
}

export const SpecReviewSummary = ({ resolved, warnings }: Props) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Návrh světa</h3>
        <Badge variant="outline" className="text-[10px] font-mono">
          seed: {resolved.seed.slice(0, 8)}…
        </Badge>
      </div>

      <div className="text-sm font-bold text-foreground">
        {resolved.userIntent.worldName}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary" className="text-[10px]">
          {resolved.userIntent.tone}
        </Badge>
        <Badge variant="secondary" className="text-[10px]">
          {resolved.userIntent.victoryStyle}
        </Badge>
        <Badge variant="secondary" className="text-[10px]">
          {resolved.userIntent.size}
        </Badge>
        <Badge variant="secondary" className="text-[10px]">
          {resolved.factionCount} frakcí
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          {resolved.userIntent.style}
        </Badge>
      </div>

      {warnings.length > 0 && (
        <ul className="space-y-1 pt-2 border-t border-border">
          {warnings.map((w, i) => (
            <li
              key={`${w.code}-${i}`}
              className="text-[11px] text-muted-foreground flex items-start gap-1.5"
            >
              <span className="text-amber-500 shrink-0">•</span>
              <span>
                {w.message}
                {w.field && (
                  <span className="font-mono ml-1 text-[10px]">({w.field})</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
