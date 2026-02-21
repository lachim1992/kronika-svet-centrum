import { useState, useMemo } from "react";
import {
  Plus, Castle, Swords, ScrollText, MessageSquareWarning,
  Sparkles, Compass, Shield, LayoutDashboard, AlertCircle,
  Clock, ChevronRight, Wrench, FileText, Image, MessageCircle,
  Crown, MapPin, Coins
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

/* ─── Types ─── */

interface PendingItem {
  id: string;
  label: string;
  detail?: string;
  icon: React.ElementType;
  action: string;
  count?: number;
  urgent?: boolean;
}

interface Props {
  currentSessionId: string;
  worldName?: string;
  currentTurn: number;
  playerName: string;
  onAction?: (action: string, payload?: any) => void;
  activeTab?: string;
  contextEntity?: { type: string; id: string; name?: string } | null;
  myRole?: string;
  // data for pending calculations
  events?: any[];
  cities?: any[];
  wonders?: any[];
  cityRumors?: any[];
  armies?: any[];
  resources?: any[];
  declarations?: any[];
  chronicles?: any[];
  players?: any[];
}

interface ActionItem {
  id: string;
  label: string;
  desc: string;
  icon: React.ElementType;
}

const CORE_ACTIONS: ActionItem[] = [
  { id: "found_city", label: "Založit osadu", desc: "Nové osídlení ve vašem území", icon: Castle },
  { id: "create_event", label: "Vytvořit událost", desc: "Bitva, smlouva, dekret, festival…", icon: Swords },
  { id: "write_chronicle", label: "Zapsat kroniku", desc: "Záznam do dějin vaší říše", icon: ScrollText },
  { id: "add_rumor", label: "Šířit zvěst", desc: "Pošeptejte zprávu do světa", icon: MessageSquareWarning },
  { id: "ai_generate", label: "AI generování", desc: "Nechat AI rozšířit příběh", icon: Sparkles },
  { id: "send_expedition", label: "Vyslat výpravu", desc: "Prozkoumat nový region", icon: Compass },
  { id: "manage_armies", label: "Správa armád", desc: "Legie, verbování, přesuny", icon: Shield },
  { id: "open_realm", label: "Přehled říše", desc: "Dashboard vaší civilizace", icon: LayoutDashboard },
];

const CITY_CONTEXT_ACTIONS: ActionItem[] = [
  { id: "add_city_rumor", label: "Městská zvěst", desc: "Zvěst o tomto městě", icon: MessageSquareWarning },
  { id: "generate_city_story", label: "Generovat příběh", desc: "AI příběh nebo obrázek města", icon: Sparkles },
];

const EVENT_CONTEXT_ACTIONS: ActionItem[] = [
  { id: "add_related_entity", label: "Přidat entitu", desc: "Propojit osobu, město…", icon: Castle },
  { id: "add_aftermath_rumor", label: "Zvěst po události", desc: "Co se říká po bitvě…", icon: MessageSquareWarning },
];

const WORLD_CONTEXT_ACTIONS: ActionItem[] = [
  { id: "launch_expedition", label: "Výprava do neznáma", desc: "Prozkoumat oblast na mapě", icon: Compass },
];

/* ─── Component ─── */

const GameHubFAB = ({
  worldName, currentTurn, playerName, onAction, activeTab, contextEntity,
  myRole = "player", events = [], cities = [], wonders = [], cityRumors = [],
  armies = [], resources = [], declarations = [], chronicles = [], players = [],
}: Props) => {
  const [open, setOpen] = useState(false);

  // ── Compute pending items ──
  const pending = useMemo(() => {
    const items: PendingItem[] = [];

    // 1. Unconfirmed events (drafts) for this player
    const draftEvents = events.filter(e => !e.confirmed && e.player === playerName);
    if (draftEvents.length > 0) {
      items.push({
        id: "draft_events", label: `${draftEvents.length} rozpracovaná událost${draftEvents.length > 1 ? "i" : ""}`,
        detail: "Čeká na potvrzení", icon: FileText, action: "view_drafts", count: draftEvents.length, urgent: true,
      });
    }

    // 2. Recent unread city rumors (last turn)
    const recentRumors = cityRumors.filter(r =>
      r.turn_number >= currentTurn - 1 &&
      cities.some(c => c.id === r.city_id && c.owner_player === playerName)
    );
    if (recentRumors.length > 0) {
      items.push({
        id: "city_whispers", label: `${recentRumors.length} nová zvěst${recentRumors.length > 1 ? "i" : ""} ve vašich městech`,
        icon: MessageCircle, action: "view_rumors", count: recentRumors.length,
      });
    }

    // 3. Pending declarations (draft status)
    const draftDecl = declarations.filter(d => d.status === "draft" && d.player_name === playerName);
    if (draftDecl.length > 0) {
      items.push({
        id: "draft_decl", label: `${draftDecl.length} rozepsané vyhlášení`,
        detail: "Dokončete a publikujte", icon: ScrollText, action: "view_declarations", count: draftDecl.length,
      });
    }

    // 4. Cities under threat
    const threatenedCities = cities.filter(c => c.owner_player === playerName && (c.status === "devastated" || c.status === "besieged"));
    if (threatenedCities.length > 0) {
      items.push({
        id: "threatened", label: `${threatenedCities.length} město${threatenedCities.length > 1 ? "a" : ""} pod hrozbou`,
        detail: threatenedCities.map(c => c.name).join(", "), icon: AlertCircle, action: "view_threats", count: threatenedCities.length, urgent: true,
      });
    }

    // 5. No events this turn
    const thisRoundEvents = events.filter(e => e.turn_number === currentTurn && e.player === playerName && e.confirmed);
    if (thisRoundEvents.length === 0) {
      items.push({
        id: "no_actions", label: "Žádné akce tento rok",
        detail: "Vytvořte událost nebo příkaz", icon: Clock, action: "create_event",
      });
    }

    return items;
  }, [events, cities, cityRumors, declarations, playerName, currentTurn]);

  // ── Admin dev counters ──
  const devCounters = useMemo(() => {
    if (myRole !== "admin") return null;
    const citiesMissingDesc = cities.filter(c => !c.flavor_prompt).length;
    const wondersMissingImg = wonders.filter(w => !w.image_url).length;
    const citiesNoRumors = cities.filter(c => !cityRumors.some(r => r.city_id === c.id)).length;
    return { citiesMissingDesc, wondersMissingImg, citiesNoRumors };
  }, [myRole, cities, wonders, cityRumors]);

  // ── Context actions ──
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

  // ── Stats for header ──
  const myCities = cities.filter(c => c.owner_player === playerName);
  const myActiveArmies = armies.filter(a => a.player_name === playerName && a.status === "Aktivní");
  const goldResource = resources.find(r => r.player_name === playerName && r.resource_type === "wealth");

  const handleAction = (actionId: string) => {
    console.log(`FAB action clicked: ${actionId}`);
    setOpen(false);
    onAction?.(actionId);
  };

  const totalPending = pending.reduce((sum, p) => sum + (p.count || 1), 0);

  return (
    <>
      {/* FAB Button with badge */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 flex items-center justify-center hover:scale-110 active:scale-95 transition-all"
        aria-label="Akce hráče"
      >
        <Plus className="h-6 w-6" />
        {totalPending > 0 && (
          <span className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
            {totalPending}
          </span>
        )}
      </button>

      {/* Command Menu */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto pb-8">
          <SheetHeader className="pb-0">
            <SheetTitle className="font-display flex items-center gap-2 text-base">
              <Plus className="h-5 w-5 text-primary" />
              Příkazy
            </SheetTitle>
          </SheetHeader>

          {/* ── Status Header ── */}
          <div className="mt-3 p-3 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <Crown className="h-4 w-4 text-primary shrink-0" />
                <span className="font-display font-bold text-sm truncate">{worldName || "Svět"}</span>
              </div>
              <Badge variant="secondary" className="font-display text-xs shrink-0">Rok {currentTurn}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-2">{playerName}</p>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3 text-muted-foreground" />
                <span className="font-semibold">{myCities.length}</span> měst
              </span>
              <span className="flex items-center gap-1">
                <Shield className="h-3 w-3 text-muted-foreground" />
                <span className="font-semibold">{myActiveArmies.length}</span> legií
              </span>
              {goldResource && (
                <span className="flex items-center gap-1">
                  <Coins className="h-3 w-3 text-muted-foreground" />
                  <span className="font-semibold">{goldResource.stockpile}</span>
                </span>
              )}
            </div>
          </div>

          <div className="mt-4 space-y-5">
            {/* ── Needs Attention ── */}
            {pending.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                  Vyžaduje pozornost
                </p>
                <div className="space-y-1.5">
                  {pending.map(p => {
                    const Icon = p.icon;
                    return (
                      <button
                        key={p.id}
                        onClick={() => handleAction(p.action)}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-lg border transition-colors text-left ${
                          p.urgent
                            ? "border-destructive/30 bg-destructive/5 hover:bg-destructive/10"
                            : "border-primary/30 bg-primary/5 hover:bg-primary/10"
                        }`}
                      >
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                          p.urgent ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"
                        }`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-display font-semibold text-sm">{p.label}</p>
                          {p.detail && <p className="text-[11px] text-muted-foreground truncate">{p.detail}</p>}
                        </div>
                        {p.count && p.count > 1 && (
                          <Badge variant={p.urgent ? "destructive" : "default"} className="text-[10px] h-5 shrink-0">
                            {p.count}
                          </Badge>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Context Actions ── */}
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

            {/* ── Core Actions ── */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Hlavní akce</p>
              <div className="grid grid-cols-1 gap-1.5">
                {CORE_ACTIONS.map(a => (
                  <ActionButton key={a.id} action={a} onClick={handleAction} />
                ))}
              </div>
            </div>

            {/* ── Admin Dev Tools ── */}
            {myRole === "admin" && devCounters && (
              <Collapsible>
                <CollapsibleTrigger className="w-full flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider py-2 hover:text-foreground transition-colors">
                  <Wrench className="h-3.5 w-3.5" />
                  Nástroje správce
                  <ChevronRight className="h-3.5 w-3.5 ml-auto transition-transform [[data-state=open]>&]:rotate-90" />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-1.5 pt-1">
                  <DevToolRow icon={FileText} label="Generovat chybějící popisy"
                    count={devCounters.citiesMissingDesc} unit="měst bez popisu"
                    onClick={() => handleAction("dev_gen_descriptions")} />
                  <DevToolRow icon={Image} label="Generovat chybějící obrázky"
                    count={devCounters.wondersMissingImg} unit="divů bez obrázku"
                    onClick={() => handleAction("dev_gen_images")} />
                  <DevToolRow icon={MessageCircle} label="Generovat chybějící zvěsti"
                    count={devCounters.citiesNoRumors} unit="měst bez zvěstí"
                    onClick={() => handleAction("dev_gen_rumors")} />
                  <DevToolRow icon={Sparkles} label="Hydratovat obsah světa"
                    onClick={() => handleAction("dev_hydrate")} />
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

/* ─── Sub-components ─── */

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
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="font-display font-semibold text-sm">{action.label}</p>
        <p className="text-xs text-muted-foreground truncate">{action.desc}</p>
      </div>
    </button>
  );
}

function DevToolRow({ icon: Icon, label, count, unit, onClick }: {
  icon: React.ElementType; label: string; count?: number; unit?: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-dashed border-border hover:border-primary/40 hover:bg-muted/50 transition-colors text-left"
    >
      <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-display">{label}</p>
        {count !== undefined && unit && (
          <p className="text-[11px] text-muted-foreground">{count} {unit}</p>
        )}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
}

export default GameHubFAB;
