import { Brain, Sparkles, Handshake } from "lucide-react";
import AIDiagnosticsPanel from "@/components/AIDiagnosticsPanel";
import SmartAIGenerationPanel from "@/components/SmartAIGenerationPanel";
import DiplomacyDebugPanel from "@/components/dev/DiplomacyDebugPanel";

interface Props {
  sessionId: string;
  myRole?: string;
  onRefetch?: () => void;
}

const AILabTab = ({ sessionId, myRole, onRefetch }: Props) => {
  const isAdmin = myRole === "admin";

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-2 mb-2">
        <Brain className="h-5 w-5 text-primary" />
        <h1 className="font-display text-lg font-bold">AI Lab</h1>
      </div>
      <AIDiagnosticsPanel sessionId={sessionId} />
      <SmartAIGenerationPanel sessionId={sessionId} onRefetch={onRefetch} />
      {isAdmin && (
        <>
          <div className="border-t border-border pt-4 mt-4" />
          <DiplomacyDebugPanel sessionId={sessionId} />
        </>
      )}
    </div>
  );
};

export default AILabTab;

