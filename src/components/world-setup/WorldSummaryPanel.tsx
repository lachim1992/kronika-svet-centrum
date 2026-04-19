import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, Map as MapIcon, Loader2 } from "lucide-react";

interface WorldSummaryPanelProps {
  mapWidth: number;
  mapHeight: number;
  resolvedFromAdvanced: boolean;
  seed: string;
  estimatedStartPositions: number;
  landRatioEstimated: number;
  // After full preview — resolved values from the engine
  resolvedFromFullPreview?: {
    mapWidth: number;
    mapHeight: number;
    seed: string;
    estimatedStartPositions: number;
    landRatioResolved: number;
  } | null;
  onRegenerateSeed: () => void;
  onFullPreview: () => void;
  fullPreviewLoading: boolean;
  fullPreviewError?: string | null;
}

export const WorldSummaryPanel = ({
  mapWidth,
  mapHeight,
  resolvedFromAdvanced,
  seed,
  estimatedStartPositions,
  landRatioEstimated,
  resolvedFromFullPreview,
  onRegenerateSeed,
  onFullPreview,
  fullPreviewLoading,
  fullPreviewError,
}: WorldSummaryPanelProps) => {
  const r = resolvedFromFullPreview;
  const showResolved = !!r;

  const dispWidth = r?.mapWidth ?? mapWidth;
  const dispHeight = r?.mapHeight ?? mapHeight;
  const dispSeed = r?.seed ?? seed;
  const dispStartPositions = r?.estimatedStartPositions ?? estimatedStartPositions;
  const dispLandRatio = r?.landRatioResolved ?? landRatioEstimated;

  return (
    <Card className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Přehled světa</h4>
        <Badge variant={showResolved ? "default" : "outline"} className="text-[10px]">
          {showResolved ? "Skutečné hodnoty" : "Odhad"}
        </Badge>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-muted-foreground">Velikost mapy</dt>
        <dd className="font-medium text-right">
          {dispWidth} × {dispHeight}
          {resolvedFromAdvanced && !showResolved && (
            <span className="text-muted-foreground ml-1">(vlastní)</span>
          )}
        </dd>

        <dt className="text-muted-foreground">Hustota pevniny</dt>
        <dd className="font-medium text-right">{Math.round(dispLandRatio * 100)}%</dd>

        <dt className="text-muted-foreground">Startovních pozic</dt>
        <dd className="font-medium text-right">{dispStartPositions}</dd>

        <dt className="text-muted-foreground">Seed</dt>
        <dd className="font-mono text-[10px] text-right truncate" title={dispSeed}>
          {dispSeed.slice(0, 12)}
          {dispSeed.length > 12 ? "…" : ""}
        </dd>
      </dl>

      <div className="flex flex-col gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRegenerateSeed}
          disabled={fullPreviewLoading}
          className="w-full"
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          Nový seed
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onFullPreview}
          disabled={fullPreviewLoading}
          className="w-full"
        >
          {fullPreviewLoading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              Generuji…
            </>
          ) : (
            <>
              <MapIcon className="h-3.5 w-3.5 mr-1.5" />
              Vygenerovat plný náhled
            </>
          )}
        </Button>
      </div>

      {fullPreviewError && (
        <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded p-2">
          {fullPreviewError}
        </div>
      )}
    </Card>
  );
};
