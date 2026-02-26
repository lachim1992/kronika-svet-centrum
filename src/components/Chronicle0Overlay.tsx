import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { BookOpen, Crown, Sword, Landmark, Flame, Users, ChevronDown } from "lucide-react";
import RichText from "@/components/RichText";

interface SidebarPerson {
  name: string;
  type: string;
  bornYear: number;
  diedYear?: number | null;
  faction: string;
  id?: string | null;
}

interface SidebarWonder {
  name: string;
  city: string;
  status: string;
}

interface SidebarBattle {
  name: string;
  year: number;
  location: string;
  attacker: string;
  defender: string;
  outcome: string;
}

interface SidebarEvent {
  title: string;
  year: number;
  type: string;
}

interface SidebarFaction {
  name: string;
  personality: string;
  isPlayer: boolean;
}

interface SidebarData {
  persons?: SidebarPerson[];
  wonders?: SidebarWonder[];
  battles?: SidebarBattle[];
  preHistoryEvents?: SidebarEvent[];
  factions?: SidebarFaction[];
}

interface Chronicle0OverlayProps {
  open: boolean;
  onClose: () => void;
  title: string;
  text: string;
  sidebar: SidebarData;
  worldName?: string;
  onEntityClick?: (type: string, id: string) => void;
}

const TYPE_ICONS: Record<string, string> = {
  "Generál": "⚔️", "Kupec": "💰", "Kněz": "🙏", "Prorok": "🔮",
  "Zakladatel": "🏛️", "Špión": "🗡️", "Válečník": "🛡️", "Učenec": "📜", "Vládce": "👑",
};

const EVENT_TYPE_ICONS: Record<string, string> = {
  founding: "🏛️", battle: "⚔️", prophecy: "🔮", cataclysm: "🌋",
  migration: "🚶", divine: "✨", betrayal: "🗡️", alliance: "🤝",
  discovery: "🔍", war: "⚔️", coronation: "👑",
};

const Chronicle0Overlay = ({ open, onClose, title, text, sidebar, worldName, onEntityClick }: Chronicle0OverlayProps) => {
  const [showScrollHint, setShowScrollHint] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setShowScrollHint(true);
  }, [open]);

  const handleScroll = () => {
    if (showScrollHint) setShowScrollHint(false);
  };

  const legendaryPersons = (sidebar.persons || []).filter(p => p.bornYear < 0);
  const livingPersons = (sidebar.persons || []).filter(p => p.bornYear >= 0 || (!p.diedYear && p.bornYear < 0));
  const legendaryBattles = (sidebar.battles || []).filter(b => b.year <= 0);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-6xl w-[95vw] h-[90vh] p-0 gap-0 overflow-hidden border-primary/30 bg-card">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary/20 via-primary/10 to-transparent border-b border-primary/20 px-6 py-4">
          <div className="flex items-center gap-3">
            <BookOpen className="h-7 w-7 text-primary" />
            <div>
              <h1 className="font-display text-xl font-bold text-foreground">{title}</h1>
              {worldName && (
                <p className="text-sm text-muted-foreground italic">Prvotní kronika světa {worldName}</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Main text */}
          <div className="flex-1 relative">
            <ScrollArea className="h-full" onScrollCapture={handleScroll} ref={scrollRef as any}>
              <div className="px-8 py-6 max-w-3xl">
                <div className="prose prose-sm dark:prose-invert">
                  <RichText
                    text={text}
                    onEntityClick={onEntityClick}
                    className="text-sm leading-[1.9] whitespace-pre-wrap font-serif"
                  />
                </div>
              </div>
            </ScrollArea>

            {/* Scroll hint */}
            {showScrollHint && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 animate-bounce text-muted-foreground flex flex-col items-center gap-1">
                <span className="text-xs">Pokračuj ve čtení</span>
                <ChevronDown className="h-4 w-4" />
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="w-72 border-l border-border bg-muted/30 hidden md:block">
            <ScrollArea className="h-full">
              <div className="p-4 space-y-5">
                {/* Factions */}
                {sidebar.factions && sidebar.factions.length > 0 && (
                  <SidebarSection icon={<Users className="h-4 w-4" />} title="Frakce">
                    {sidebar.factions.map((f, i) => (
                      <div key={i} className="flex items-center justify-between gap-1">
                        <span className="text-xs truncate">{f.isPlayer ? "👑 " : ""}{f.name}</span>
                        <Badge variant="outline" className="text-[10px] shrink-0">{f.personality}</Badge>
                      </div>
                    ))}
                  </SidebarSection>
                )}

                {/* Legendary Persons */}
                {legendaryPersons.length > 0 && (
                  <SidebarSection icon={<Crown className="h-4 w-4" />} title="Legendární postavy">
                    {legendaryPersons.map((p, i) => (
                      <div key={i} className="text-xs">
                        <span className="mr-1">{TYPE_ICONS[p.type] || "👤"}</span>
                        <span className="font-medium">{p.name}</span>
                        <span className="text-muted-foreground ml-1">
                          ({p.type}, r. {p.bornYear}{p.diedYear ? ` – ${p.diedYear}` : ""})
                        </span>
                      </div>
                    ))}
                  </SidebarSection>
                )}

                {/* Wonders */}
                {sidebar.wonders && sidebar.wonders.length > 0 && (
                  <SidebarSection icon={<Landmark className="h-4 w-4" />} title="Divy světa">
                    {sidebar.wonders.map((w, i) => (
                      <div key={i} className="text-xs">
                        <span className="font-medium">{w.name}</span>
                        <span className="text-muted-foreground ml-1">
                          ({w.city}) {w.status === "destroyed" ? "🏚️ ruiny" : "✨"}
                        </span>
                      </div>
                    ))}
                  </SidebarSection>
                )}

                {/* Legendary Battles */}
                {legendaryBattles.length > 0 && (
                  <SidebarSection icon={<Sword className="h-4 w-4" />} title="Legendární bitvy">
                    {legendaryBattles.map((b, i) => (
                      <div key={i} className="text-xs">
                        <span className="font-medium">{b.name}</span>
                        <span className="text-muted-foreground block ml-0">
                          Rok {b.year} u {b.location}
                        </span>
                      </div>
                    ))}
                  </SidebarSection>
                )}

                {/* Pre-history events */}
                {sidebar.preHistoryEvents && sidebar.preHistoryEvents.length > 0 && (
                  <SidebarSection icon={<Flame className="h-4 w-4" />} title="Prehistorické události">
                    {sidebar.preHistoryEvents.map((e, i) => (
                      <div key={i} className="text-xs">
                        <span className="mr-1">{EVENT_TYPE_ICONS[e.type] || "📌"}</span>
                        <span className="font-medium">{e.title}</span>
                        <span className="text-muted-foreground ml-1">(r. {e.year})</span>
                      </div>
                    ))}
                  </SidebarSection>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-3 flex items-center justify-between bg-card">
          <p className="text-xs text-muted-foreground italic">
            „A tak začíná nový věk..."
          </p>
          <Button onClick={onClose} className="font-display">
            <BookOpen className="h-4 w-4 mr-2" />
            Vstoupit do světa
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const SidebarSection = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
  <div>
    <div className="flex items-center gap-2 mb-2">
      <span className="text-primary">{icon}</span>
      <h3 className="text-xs font-display font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
    </div>
    <div className="space-y-1.5">
      {children}
    </div>
    <Separator className="mt-3" />
  </div>
);

export default Chronicle0Overlay;
