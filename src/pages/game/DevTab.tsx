import DevModePanel from "@/components/DevModePanel";
import { Wrench } from "lucide-react";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  citiesCount: number;
  eventsCount: number;
  wondersCount: number;
  memoriesCount: number;
  playersCount: number;
  onRefetch: () => void;
}

const DevTab = ({
  sessionId, currentPlayerName,
  citiesCount, eventsCount, wondersCount, memoriesCount, playersCount,
  onRefetch,
}: Props) => {
  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-2 mb-2">
        <Wrench className="h-5 w-5 text-primary" />
        <h1 className="font-display text-lg font-bold">Dev Tools</h1>
      </div>
      <DevModePanel
        sessionId={sessionId}
        currentPlayerName={currentPlayerName}
        onRefetch={onRefetch}
        citiesCount={citiesCount}
        eventsCount={eventsCount}
        wondersCount={wondersCount}
        memoriesCount={memoriesCount}
        playersCount={playersCount}
      />
    </div>
  );
};

export default DevTab;
