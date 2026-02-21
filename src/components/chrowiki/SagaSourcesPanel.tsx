import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertTriangle, Calendar, ChevronDown, ChevronUp, Database, Users, Scroll, BarChart3 } from "lucide-react";
import type { SagaContextData } from "@/lib/sagaContext";

interface Props {
  context: SagaContextData;
  onEventClick: (eventId: string, title: string) => void;
}

const SagaSourcesPanel = ({ context, onEventClick }: Props) => {
  const [open, setOpen] = useState(false);
  const { sourceCounts, timeline } = context;
  const insufficient = sourceCounts.events < 3;

  return (
    <div className="mb-4">
      {insufficient && (
        <div className="flex items-center gap-2 p-3 rounded-lg mb-2"
          style={{ background: 'hsl(var(--destructive) / 0.1)', border: '1px solid hsl(var(--destructive) / 0.3)' }}
        >
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-xs text-destructive font-body">
            <strong>Nedostatek zdrojů</strong> — nalezeny pouze {sourceCounts.events} události.
            Sága bude označena jako spekulativní „proto-sága". Zvažte výběr nadřazené entity (provincie/region).
          </p>
        </div>
      )}

      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full justify-between text-xs h-8 px-3"
            style={{ background: 'hsl(var(--secondary) / 0.3)', border: '1px solid hsl(var(--border))' }}
          >
            <span className="flex items-center gap-2">
              <Database className="h-3.5 w-3.5 text-primary" />
              Zdroje ságy
            </span>
            <span className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[9px]">
                <Calendar className="h-2.5 w-2.5 mr-0.5" />{sourceCounts.events}
              </Badge>
              <Badge variant="secondary" className="text-[9px]">
                <Users className="h-2.5 w-2.5 mr-0.5" />{sourceCounts.actors}
              </Badge>
              <Badge variant="secondary" className="text-[9px]">
                <Scroll className="h-2.5 w-2.5 mr-0.5" />{sourceCounts.chronicles}
              </Badge>
              {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </span>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="p-3 mt-1 rounded-lg space-y-2"
            style={{ background: 'hsl(var(--secondary) / 0.2)', border: '1px solid hsl(var(--border))' }}
          >
            <div className="grid grid-cols-3 md:grid-cols-5 gap-2 text-center text-[10px]">
              <div>
                <div className="font-bold text-foreground text-sm">{sourceCounts.events}</div>
                <div className="text-muted-foreground">Události</div>
              </div>
              <div>
                <div className="font-bold text-foreground text-sm">{sourceCounts.actors}</div>
                <div className="text-muted-foreground">Aktéři</div>
              </div>
              <div>
                <div className="font-bold text-foreground text-sm">{sourceCounts.chronicles}</div>
                <div className="text-muted-foreground">Kroniky</div>
              </div>
              <div>
                <div className="font-bold text-foreground text-sm">{sourceCounts.stats}</div>
                <div className="text-muted-foreground">Statistiky</div>
              </div>
              <div>
                <div className="font-bold text-foreground text-sm">{sourceCounts.declarations}</div>
                <div className="text-muted-foreground">Deklarace</div>
              </div>
            </div>

            {timeline.length > 0 && (
              <div className="pt-2" style={{ borderTop: '1px solid hsl(var(--border))' }}>
                <p className="text-[10px] text-muted-foreground font-display mb-1.5">Top události:</p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {timeline.slice(0, 10).map(t => (
                    <div key={t.eventId}
                      className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => onEventClick(t.eventId, t.title)}
                    >
                      <Badge variant="outline" className="text-[9px] shrink-0 w-12 justify-center">K{t.turn}</Badge>
                      <span className="font-display truncate text-foreground">{t.title}</span>
                      {t.category && <Badge variant="secondary" className="text-[8px] ml-auto shrink-0">{t.category}</Badge>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default SagaSourcesPanel;
