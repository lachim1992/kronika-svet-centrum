// BlueprintStaleWarning — banner shown when terrain edits invalidated the
// AI-derived geographyBlueprint. Offers regen CTA.
//
// Visibility rule: only render when isBlueprintStale === true.
// Regen disabled when isSuggestionStale (must re-analyze first) or isBusy.

import { AlertTriangle, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  isSuggestionStale: boolean;
  isBusy: boolean;
  isRegenerating: boolean;
  onRegenerate: () => void;
  blueprintRegenError: string | null;
}

export const BlueprintStaleWarning = ({
  isSuggestionStale,
  isBusy,
  isRegenerating,
  onRegenerate,
  blueprintRegenError,
}: Props) => {
  const regenDisabled = isSuggestionStale || isBusy;
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
        <div className="flex-1 text-xs space-y-1">
          <div className="font-semibold text-foreground">Geografie zastarala</div>
          <p className="text-muted-foreground leading-snug">
            Změnili jste parametry terénu. AI musí přegenerovat geografii světa,
            aby návrh odpovídal vašim úpravám.
          </p>
          {isSuggestionStale && (
            <p className="text-amber-600 dark:text-amber-400">
              Před regenerací nejprve znovu analyzujte premisu.
            </p>
          )}
        </div>
      </div>

      {blueprintRegenError && (
        <div className="text-[11px] text-destructive bg-destructive/10 border border-destructive/30 rounded px-2 py-1.5">
          {blueprintRegenError}
        </div>
      )}

      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onRegenerate}
        disabled={regenDisabled}
        className="w-full"
      >
        {isRegenerating ? (
          <>
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            Regeneruji geografii…
          </>
        ) : (
          <>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Regenerovat blueprint
          </>
        )}
      </Button>
    </div>
  );
};
