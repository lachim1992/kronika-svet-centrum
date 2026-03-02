import { Brain } from "lucide-react";
import AIDiagnosticsPanel from "@/components/AIDiagnosticsPanel";

interface Props {
  sessionId: string;
}

const AILabTab = ({ sessionId }: Props) => {
  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-2 mb-2">
        <Brain className="h-5 w-5 text-primary" />
        <h1 className="font-display text-lg font-bold">AI Lab</h1>
      </div>
      <AIDiagnosticsPanel sessionId={sessionId} />
    </div>
  );
};

export default AILabTab;
