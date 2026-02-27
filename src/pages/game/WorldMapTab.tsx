import WorldHexMap from "@/components/WorldHexMap";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  myRole: string;
  worldName?: string;
  currentTurn?: number;
  onCityClick?: (cityId: string) => void;
}

const WorldMapTab = ({ sessionId, currentPlayerName, myRole, worldName, currentTurn, onCityClick }: Props) => {
  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 120px)", minHeight: 400 }}>
      <WorldHexMap
        sessionId={sessionId}
        playerName={currentPlayerName}
        myRole={myRole}
        currentTurn={currentTurn}
        onCityClick={onCityClick}
      />

      {/* Overlay: world name badge */}
      {worldName && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="px-4 py-1.5 rounded-full bg-card/80 backdrop-blur-md border border-border shadow-lg">
            <span className="text-xs font-display font-bold tracking-wider uppercase text-foreground/80">
              {worldName}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorldMapTab;
