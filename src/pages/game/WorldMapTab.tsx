import { Map, Compass, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import WorldHexMap from "@/components/WorldHexMap";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  myRole: string;
  worldName?: string;
  onCityClick?: (cityId: string) => void;
}

const WorldMapTab = ({ sessionId, currentPlayerName, myRole, worldName, onCityClick }: Props) => {
  return (
    <div className="space-y-4 pb-20">
      {/* ─── Immersive Header ─── */}
      <div className="game-card relative overflow-hidden">
        {/* Decorative background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-accent/5 pointer-events-none" />
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <Map className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-display font-bold tracking-wide">
                Mapa světa
              </h2>
              {worldName && (
                <p className="text-xs text-muted-foreground font-display italic">
                  {worldName}
                </p>
              )}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Badge variant="outline" className="text-[9px] gap-1 font-display border-primary/20">
                <Compass className="h-3 w-3" />
                Průzkum
              </Badge>
            </div>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed max-w-lg">
            Prozkoumejte neznámé provincie kliknutím na hraniční hexy.
            Přesouvejte se po objevených oblastech a rozšiřujte svou říši.
          </p>
        </div>
      </div>

      {/* ─── Map Container ─── */}
      <div className="game-card p-0 overflow-hidden relative">
        {/* Top ornament line */}
        <div className="h-[2px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

        <WorldHexMap
          sessionId={sessionId}
          playerName={currentPlayerName}
          myRole={myRole}
          onCityClick={onCityClick}
        />

        {/* Bottom ornament line */}
        <div className="h-[2px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
      </div>

      {/* ─── Legend ─── */}
      <div className="game-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <h4 className="text-xs font-display font-semibold uppercase tracking-wider text-muted-foreground">
            Legenda
          </h4>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
          <LegendItem color="bg-[#4a6030]" label="Pláně" />
          <LegendItem color="bg-[#1f4a28]" label="Les" />
          <LegendItem color="bg-[#6a5a38]" label="Kopce" />
          <LegendItem color="bg-[#4a4a50]" label="Hory" />
          <LegendItem color="bg-[#1a3550]" label="Moře" />
          <LegendItem color="bg-[#8a7a40]" label="Poušť" />
          <LegendItem color="bg-[#2a4a3a]" label="Bažiny" />
          <LegendItem color="bg-[#4a6878]" label="Tundra" />
        </div>
        <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-border">
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="w-3 h-3 rounded-full border-2 border-[hsl(45,90%,55%)] bg-card inline-block" />
            Aktuální pozice
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="w-3 h-3 rounded border border-dashed border-muted-foreground/40 bg-[#111318] opacity-40 inline-block" />
            Neprozkoumaný hex
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            🏰 Město
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            👑 Hlavní město
          </span>
        </div>
      </div>
    </div>
  );
};

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-3 h-3 rounded ${color} border border-border inline-block`} />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

export default WorldMapTab;
