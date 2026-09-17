import { useEffect } from "react";
import { BarChart3, BookOpen, Brain, Crown, FlaskConical, Globe, Home, Map, Newspaper, Shield, Swords, Timer, Trophy, Wrench, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useSandboxMode } from "@/hooks/useSandboxMode";
import type { TabId } from "./BottomNav";

interface Props {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  showDevTab?: boolean;
  showPersistentTab?: boolean;
}

const baseItems: Array<{ id: TabId; label: string; icon: React.ElementType }> = [
  { id: "worldmap", label: "Mapa", icon: Map },
  { id: "home", label: "Říše", icon: Home },
  { id: "realm", label: "Diplomacie", icon: Shield },
  { id: "army", label: "Armády", icon: Swords },
  { id: "economy", label: "Ekonomika", icon: BarChart3 },
  { id: "world", label: "Svět", icon: Globe },
  { id: "council", label: "Rada", icon: Crown },
  { id: "chronicles", label: "Kroniky", icon: BookOpen },
  { id: "feed", label: "Šepoty", icon: Newspaper },
  { id: "wiki", label: "ChroWiki", icon: BookOpen },
  { id: "games", label: "Hry", icon: Trophy },
  { id: "engine", label: "Engine", icon: Zap },
];

export default function MapTopNav({ activeTab, onTabChange, showDevTab, showPersistentTab }: Props) {
  const { sandbox, toggleSandbox, setSandbox } = useSandboxMode();
  const items = [
    ...baseItems,
    ...(showPersistentTab ? [{ id: "persistent" as TabId, label: "Persistent", icon: Timer }] : []),
    ...(showDevTab ? [{ id: "dev" as TabId, label: "Dev", icon: Wrench }, { id: "ailab" as TabId, label: "AI Lab", icon: Brain }] : []),
  ];

  useEffect(() => {
    if (!showDevTab && sandbox) setSandbox(false);
  }, [sandbox, setSandbox, showDevTab]);

  return (
    <nav className="map-command-nav" aria-label="Herní moduly">
      <div className="flex h-11 items-center gap-1 overflow-x-auto px-2 scrollbar-hide md:px-4">
        {items.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <Button
              key={id}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onTabChange(active && id !== "worldmap" ? "worldmap" : id)}
              aria-pressed={active}
              title={active && id !== "worldmap" ? `Zavřít ${label}` : `Otevřít ${label}`}
              className={cn(
                "group relative h-8 shrink-0 gap-1.5 rounded-md border px-2.5 text-[11px] font-medium tracking-normal transition-all",
                active
                  ? "border-primary/55 bg-primary/15 text-primary shadow-[inset_0_-2px_0_hsl(var(--primary))]"
                  : "border-transparent text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={active ? 2.2 : 1.5} />
              <span className="hidden lg:inline">{label}</span>
            </Button>
          );
        })}
        {showDevTab && <div className="ml-auto flex shrink-0 items-center pl-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={toggleSandbox}
            aria-pressed={sandbox}
            title={sandbox
              ? "Testovací režim je zapnutý: stavby a úpravy nic nestojí a dokončí se hned"
              : "Zapnout testovací režim: stavby a úpravy bez nákladů a čekání"}
            className={cn(
              "h-8 shrink-0 gap-1.5 rounded-md border px-2.5 text-[11px] font-medium transition-all",
              sandbox
                ? "border-amber-400/60 bg-amber-400/15 text-amber-300"
                : "border-transparent text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <FlaskConical className="h-3.5 w-3.5" strokeWidth={sandbox ? 2.2 : 1.5} />
            <span className="hidden lg:inline">{sandbox ? "Test: zapnuto" : "Test režim"}</span>
          </Button>
        </div>}
      </div>
    </nav>
  );
}
