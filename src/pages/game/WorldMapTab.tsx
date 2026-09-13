import WorldHexMap from "@/components/WorldHexMap";
import { useIsMobile } from "@/hooks/use-mobile";
import ManpowerHUDCard from "@/components/map/ManpowerHUDCard";
import WorldMapBuildPanel from "@/components/map/WorldMapBuildPanel";
import RouteDetailSheet from "@/components/map/RouteDetailSheet";
import IsometricSquareMap from "@/components/map/IsometricSquareMap";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  myRole: string;
  worldName?: string;
  currentTurn?: number;
  onCityClick?: (cityId: string) => void;
  gridKind?: "hex6" | "square4";
  backgroundMode?: boolean;
}

const WorldMapTab = ({ sessionId, currentPlayerName, myRole, worldName, currentTurn, onCityClick, gridKind = "hex6", backgroundMode = false }: Props) => {
  const isMobile = useIsMobile();

  return (
    <div className="relative h-full w-full min-h-[300px]">
      {gridKind === "square4" ? (
        <IsometricSquareMap sessionId={sessionId} playerName={currentPlayerName} onCityClick={onCityClick} />
      ) : <WorldHexMap
        sessionId={sessionId}
        playerName={currentPlayerName}
        myRole={myRole}
        currentTurn={currentTurn}
        onCityClick={onCityClick}
      />}

      {/* Stage 8 floating overlays */}
      {!backgroundMode && <ManpowerHUDCard sessionId={sessionId} playerName={currentPlayerName} />}
      {!backgroundMode && <WorldMapBuildPanel sessionId={sessionId} playerName={currentPlayerName} currentTurn={currentTurn} />}
      {!backgroundMode && <RouteDetailSheet sessionId={sessionId} playerName={currentPlayerName} currentTurn={currentTurn} />}

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
