import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Zap, Database, Settings2, Telescope, ChevronDown } from "lucide-react";
import HydrationSection from "@/components/dev/HydrationSection";
import RealSimulationSection from "@/components/dev/RealSimulationSection";
import WorldIntegritySection from "@/components/dev/WorldIntegritySection";
import SeedSection from "@/components/dev/SeedSection";
import SeedMapManager from "@/components/dev/SeedMapManager";
import QATestSection from "@/components/dev/QATestSection";
import EconomyQASection from "@/components/dev/EconomyQASection";
import ObservatoryPanel from "@/components/dev/observatory/ObservatoryPanel";
import DevNodeSpawner from "@/components/dev/DevNodeSpawner";
import DevNodeEditor from "@/components/dev/DevNodeEditor";
import DevPlayerEditor from "@/components/dev/DevPlayerEditor";
import FormulaTunerPanel from "@/components/dev/FormulaTunerPanel";
import { getPermissions } from "@/lib/permissions";

interface DevModePanelProps {
  sessionId: string;
  currentPlayerName: string;
  myRole?: string;
  onRefetch?: () => void;
  citiesCount: number;
  eventsCount: number;
  wondersCount: number;
  memoriesCount: number;
  playersCount: number;
}

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function DevSection({ icon, title, badge, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border rounded-lg bg-card/50">
      <CollapsibleTrigger className="flex items-center gap-2 w-full px-3 py-2.5 text-left hover:bg-muted/20 transition-colors rounded-lg">
        <span className="text-primary">{icon}</span>
        <span className="font-display font-semibold text-sm flex-1">{title}</span>
        {badge && <Badge variant="outline" className="text-[9px]">{badge}</Badge>}
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3 pt-1 space-y-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

const DevModePanel = ({
  sessionId, currentPlayerName, myRole = "player", onRefetch,
  citiesCount, eventsCount, wondersCount, memoriesCount, playersCount,
}: DevModePanelProps) => {
  const perms = getPermissions(myRole);

  return (
    <div className="space-y-3">
      {/* Stats */}
      <div className="grid grid-cols-5 gap-2">
        {[
          { label: "Města", count: citiesCount },
          { label: "Události", count: eventsCount },
          { label: "Divy", count: wondersCount },
          { label: "Paměti", count: memoriesCount },
          { label: "Hráči", count: playersCount },
        ].map(s => (
          <div key={s.label} className="bg-card border rounded-lg p-2 text-center">
            <p className="text-xl font-bold font-display">{s.count}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ENGINE */}
      {perms.canRunServerDevTools && (
        <DevSection icon={<Zap className="h-4 w-4" />} title="Engine" badge="Simulace & Integrita" defaultOpen>
          <div className="space-y-4">
            <RealSimulationSection sessionId={sessionId} currentPlayerName={currentPlayerName} onRefetch={onRefetch} />
            <div className="border-t border-border/50 pt-3">
              <HydrationSection sessionId={sessionId} onRefetch={onRefetch} />
            </div>
            <div className="border-t border-border/50 pt-3">
              <WorldIntegritySection sessionId={sessionId} onRefetch={onRefetch} />
            </div>
          </div>
        </DevSection>
      )}

      {/* DATA & SEEDING */}
      {perms.canRunServerDevTools && (
        <DevSection icon={<Database className="h-4 w-4" />} title="Data & Seeding" badge="Seed, QA, Economy">
          <div className="space-y-4">
            <SeedSection sessionId={sessionId} onRefetch={onRefetch} />
            <div className="border-t border-border/50 pt-3">
              <SeedMapManager sessionId={sessionId} onRefetch={onRefetch} />
            </div>
            <div className="border-t border-border/50 pt-3">
              <EconomyQASection sessionId={sessionId} onRefetch={onRefetch} />
            </div>
            <div className="border-t border-border/50 pt-3">
              <QATestSection sessionId={sessionId} onRefetch={onRefetch} />
            </div>
          </div>
        </DevSection>
      )}

      {/* EDITORS */}
      <DevSection icon={<Settings2 className="h-4 w-4" />} title="Editors" badge="Nodes, Players, Formulas">
        <div className="space-y-4">
          <DevNodeSpawner sessionId={sessionId} onRefetch={onRefetch} />
          <div className="border-t border-border/50 pt-3">
            <DevNodeEditor sessionId={sessionId} onRefetch={onRefetch} />
          </div>
          <div className="border-t border-border/50 pt-3">
            <DevPlayerEditor sessionId={sessionId} onRefetch={onRefetch} />
          </div>
          <div className="border-t border-border/50 pt-3">
            <FormulaTunerPanel sessionId={sessionId} />
          </div>
        </div>
      </DevSection>

      {/* OBSERVATORY */}
      <DevSection icon={<Telescope className="h-4 w-4" />} title="Observatory" badge="System MRI" defaultOpen={false}>
        <ObservatoryPanel sessionId={sessionId} />
      </DevSection>
    </div>
  );
};

export default DevModePanel;
