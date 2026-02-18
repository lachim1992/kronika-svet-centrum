import { useState } from "react";
import {
  Plus, X, Castle, Swords, ScrollText, MessageSquareWarning,
  Sparkles, Compass, Shield, LayoutDashboard
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface Props {
  currentSessionId: string;
  worldName?: string;
  currentTurn: number;
  playerName: string;
  onAction?: (action: string) => void;
  activeTab?: string;
  /** Context entity for context-aware actions */
  contextEntity?: { type: string; id: string; name?: string } | null;
}

interface ActionItem {
  id: string;
  label: string;
  desc: string;
  icon: React.ElementType;
  category: "core" | "context";
}

const CORE_ACTIONS: ActionItem[] = [
  { id: "found_city", label: "Založit město", desc: "Nové osídlení ve vašem území", icon: Castle, category: "core" },
  { id: "create_event", label: "Vytvořit událost", desc: "Bitva, smlouva, dekret, festival…", icon: Swords, category: "core" },
  { id: "write_chronicle", label: "Zapsat kroniku", desc: "Záznam do dějin vaší říše", icon: ScrollText, category: "core" },
  { id: "add_rumor", label: "Šířit zvěst", desc: "Pošeptejte zprávu do světa", icon: MessageSquareWarning, category: "core" },
  { id: "ai_generate", label: "AI generování", desc: "Nechat AI rozšířit příběh", icon: Sparkles, category: "core" },
  { id: "send_expedition", label: "Vyslat výpravu", desc: "Prozkoumat nový region", icon: Compass, category: "core" },
  { id: "manage_armies", label: "Správa armád", desc: "Legie, verbování, přesuny", icon: Shield, category: "core" },
  { id: "open_realm", label: "Přehled říše", desc: "Dashboard vaší civilizace", icon: LayoutDashboard, category: "core" },
];

const CITY_CONTEXT_ACTIONS: ActionItem[] = [
  { id: "add_city_rumor", label: "Městská zvěst", desc: "Zvěst o tomto městě", icon: MessageSquareWarning, category: "context" },
  { id: "generate_city_story", label: "Generovat příběh", desc: "AI příběh nebo obrázek města", icon: Sparkles, category: "context" },
];

const EVENT_CONTEXT_ACTIONS: ActionItem[] = [
  { id: "add_related_entity", label: "Přidat entitu", desc: "Propojit osobu, město…", icon: Castle, category: "context" },
  { id: "add_aftermath_rumor", label: "Zvěst po události", desc: "Co se říká po bitvě…", icon: MessageSquareWarning, category: "context" },
];

const WORLD_CONTEXT_ACTIONS: ActionItem[] = [
  { id: "launch_expedition", label: "Výprava do neznáma", desc: "Prozkoumat oblast na mapě", icon: Compass, category: "context" },
];

const GameHubFAB = ({ onAction, activeTab, contextEntity }: Props) => {
  const [open, setOpen] = useState(false);

  // Determine context-specific actions
  let contextActions: ActionItem[] = [];
  let contextLabel = "";
  if (contextEntity?.type === "city") {
    contextActions = CITY_CONTEXT_ACTIONS;
    contextLabel = `🏛️ ${contextEntity.name || "Město"}`;
  } else if (contextEntity?.type === "event") {
    contextActions = EVENT_CONTEXT_ACTIONS;
    contextLabel = `📜 ${contextEntity.name || "Událost"}`;
  } else if (activeTab === "world") {
    contextActions = WORLD_CONTEXT_ACTIONS;
    contextLabel = "🌍 Svět";
  }

  const handleAction = (actionId: string) => {
    setOpen(false);
    onAction?.(actionId);
  };

  return (
    <>
      {/* FAB Button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 flex items-center justify-center hover:scale-110 active:scale-95 transition-all"
        aria-label="Akce hráče"
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* Command Menu Sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh] overflow-y-auto pb-8">
          <SheetHeader>
            <SheetTitle className="font-display flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Co chcete provést?
            </SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-5">
            {/* Context-aware section */}
            {contextActions.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  {contextLabel} — rychlé akce
                </p>
                <div className="grid grid-cols-1 gap-1.5">
                  {contextActions.map(a => (
                    <ActionButton key={a.id} action={a} onClick={handleAction} accent />
                  ))}
                </div>
              </div>
            )}

            {/* Core actions */}
            <div>
              {contextActions.length > 0 && (
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Hlavní akce</p>
              )}
              <div className="grid grid-cols-1 gap-1.5">
                {CORE_ACTIONS.map(a => (
                  <ActionButton key={a.id} action={a} onClick={handleAction} />
                ))}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

function ActionButton({ action, onClick, accent }: { action: ActionItem; onClick: (id: string) => void; accent?: boolean }) {
  const Icon = action.icon;
  return (
    <button
      onClick={() => onClick(action.id)}
      className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
        accent
          ? "border-primary/40 bg-primary/5 hover:bg-primary/10"
          : "border-border hover:border-primary/50 hover:bg-primary/5"
      }`}
    >
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
        accent ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
      }`}>
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0">
        <p className="font-display font-semibold text-sm">{action.label}</p>
        <p className="text-xs text-muted-foreground truncate">{action.desc}</p>
      </div>
    </button>
  );
}

export default GameHubFAB;
