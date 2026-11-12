import { useIsMobile } from "@/hooks/use-mobile";
import ManpowerHUDCard from "@/components/map/ManpowerHUDCard";
import IsometricSquareMap from "@/components/map/IsometricSquareMap";
import { lazy, Suspense, useState } from "react";
// A stale module after an update must not blank the game: reload once, then fall back to a message.
const Map3DTrial = lazy(() => import("@/components/map/three/Map3DTrial").catch(() => {
  const key = "map3d-reload";
  if (!sessionStorage.getItem(key)) { sessionStorage.setItem(key, "1"); window.location.reload(); }
  return { default: () => <div className="flex h-full items-center justify-center text-sm text-muted-foreground">3D mapu se nepodařilo načíst. Obnovte stránku.</div> };
}).then((m) => { sessionStorage.removeItem("map3d-reload"); return m; }));

interface Props {
  sessionId: string;
  currentPlayerName: string;
  myRole: string;
  worldName?: string;
  currentTurn?: number;
  onCityClick?: (cityId: string) => void;
  gridKind?: "hex6" | "square4";
  backgroundMode?: boolean;
  onDetailOpenChange?: (open: boolean) => void;
  resetSignal?: number;
}

const WorldMapTab = ({ sessionId, currentPlayerName, myRole, worldName, currentTurn, onCityClick, gridKind = "hex6", backgroundMode = false, onDetailOpenChange, resetSignal = 0 }: Props) => {
  const isMobile = useIsMobile();
  const [view3d, setView3d] = useState(false);

  return (
    <div className="relative h-full w-full min-h-[300px]">
      {view3d ? (
        <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Načítám 3D mapu…</div>}>
          <Map3DTrial sessionId={sessionId} />
        </Suspense>
      ) : (
      <IsometricSquareMap
        sessionId={sessionId}
        playerName={currentPlayerName}
        currentTurn={currentTurn}
        onCityClick={onCityClick}
        gridKind={gridKind}
        onDetailOpenChange={onDetailOpenChange}
        resetSignal={resetSignal}
      />
      )}
      {!backgroundMode && (
        <button type="button" onClick={() => setView3d((v) => !v)}
          className="absolute bottom-4 left-4 z-30 rounded-full border border-border bg-card/85 px-3 py-1 text-xs font-semibold text-foreground shadow-lg backdrop-blur-md hover:bg-card">
          {view3d ? "Zpět na původní mapu" : "3D náhled (zkušební)"}
        </button>
      )}

      {/* Phase 5: roads are built on the physical map layer (road_projects /
          road_segments) only. The abstract province_routes graph stays internal
          (military topology), so its duplicate build panel was removed. */}
      {!backgroundMode && <ManpowerHUDCard sessionId={sessionId} playerName={currentPlayerName} />}

      {/* Overlay: world name badge */}
      {worldName && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className={`${isMobile ? 'px-2.5 py-1' : 'px-4 py-1.5'} rounded-full bg-card/80 backdrop-blur-md border border-border shadow-lg`}>
            <span className={`${isMobile ? 'text-[10px]' : 'text-xs'} font-display font-bold tracking-wider uppercase text-foreground/80`}>
              {worldName}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorldMapTab;
