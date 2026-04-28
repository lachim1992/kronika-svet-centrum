import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Plus, Minus, Home, Loader2, RefreshCw, Eye } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useIsMobile } from "@/hooks/use-mobile";

interface Props {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onHome: () => void;
  layersTrigger: ReactNode;
  // Admin-only dev cluster
  isAdmin?: boolean;
  devMode?: boolean;
  onDevModeToggle?: (v: boolean) => void;
  onRecomputeBiomes?: () => void;
  onRecomputeEconomy?: () => void;
  recomputingBiomes?: boolean;
  recomputingEconomy?: boolean;
}

export default function MapBottomDock({
  zoom, onZoomIn, onZoomOut, onHome, layersTrigger,
  isAdmin, devMode, onDevModeToggle,
  onRecomputeBiomes, onRecomputeEconomy,
  recomputingBiomes, recomputingEconomy,
}: Props) {
  const isMobile = useIsMobile();
  const zoomPct = Math.round(zoom * 100);

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
      <div
        className="pointer-events-auto flex items-center gap-1 px-2 py-1.5 rounded-full bg-card/90 backdrop-blur-md border border-border shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Zoom group */}
        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={onZoomOut} title="Oddálit (−)">
          <Minus className="h-4 w-4" />
        </Button>
        {!isMobile && (
          <span className="text-[10px] font-mono tabular-nums text-muted-foreground min-w-[36px] text-center select-none">
            {zoomPct}%
          </span>
        )}
        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={onZoomIn} title="Přiblížit (+)">
          <Plus className="h-4 w-4" />
        </Button>

        <Separator orientation="vertical" className="h-5 mx-1" />

        {/* Home */}
        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={onHome} title="Hlavní město (H)">
          <Home className="h-4 w-4" />
        </Button>

        <Separator orientation="vertical" className="h-5 mx-1" />

        {/* Layers popover trigger */}
        {layersTrigger}

        {/* Admin cluster */}
        {isAdmin && (
          <>
            <Separator orientation="vertical" className="h-5 mx-1" />
            <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer px-1.5">
              <Eye className="h-3 w-3" />
              {!isMobile && "DEV"}
              <Switch checked={!!devMode} onCheckedChange={onDevModeToggle} className="scale-75" />
            </label>
            {devMode && (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-full"
                  onClick={onRecomputeBiomes}
                  disabled={recomputingBiomes}
                  title="Přepočítat biomy"
                >
                  {recomputingBiomes
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <RefreshCw className="h-4 w-4" />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 text-[10px] gap-1 rounded-full"
                  onClick={onRecomputeEconomy}
                  disabled={recomputingEconomy}
                  title="Přepočítat ekonomiku"
                >
                  {recomputingEconomy
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : "♻️"}
                  {!isMobile && "Eko"}
                </Button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
