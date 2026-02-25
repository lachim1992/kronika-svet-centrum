import { Home, Globe, Shield, Newspaper, BookOpen, Crown, Swords, BarChart3, Timer, Wrench, Map, Zap } from "lucide-react";

export type TabId = "home" | "world" | "worldmap" | "realm" | "army" | "economy" | "chronicles" | "feed" | "codex" | "wiki" | "council" | "engine" | "persistent" | "dev";

interface Props {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  showDevTab?: boolean;
  showPersistentTab?: boolean;
}

const allTabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "home", label: "Říše", icon: Home },
  { id: "world", label: "Svět", icon: Globe },
  { id: "worldmap", label: "Mapa", icon: Map },
  { id: "realm", label: "Správa", icon: Shield },
  { id: "army", label: "Armáda", icon: Swords },
  { id: "economy", label: "Ekonomika", icon: BarChart3 },
  { id: "engine", label: "Engine", icon: Zap },
  { id: "council", label: "Rada", icon: Crown },
  { id: "feed", label: "Šepoty", icon: Newspaper },
  { id: "wiki", label: "ChroWiki", icon: BookOpen },
];

const devTab = { id: "dev" as TabId, label: "Dev", icon: Wrench };
const persistentTab = { id: "persistent" as TabId, label: "Persistent", icon: Timer };

const BottomNav = ({ activeTab, onTabChange, showDevTab = false, showPersistentTab = false }: Props) => {
  let tabs = [...allTabs];
  if (showPersistentTab) tabs.push(persistentTab);
  if (showDevTab) tabs.push(devTab);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border backdrop-blur-md"
      style={{ background: "hsl(220 28% 8% / 0.95)" }}
    >
      <div className="flex items-center justify-evenly w-full h-14 px-0.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              style={{ flex: "1 1 0%", minWidth: 0 }}
              className={`flex flex-col items-center gap-0.5 py-1.5 rounded-lg transition-all duration-200 relative ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={isActive ? 2.2 : 1.5} />
              <span className="text-[8px] uppercase tracking-[0.1em] leading-none" style={{ fontFamily: "'Cinzel', serif" }}>{tab.label}</span>
              {isActive && (
                <span className="absolute -bottom-1 w-6 h-[2px] rounded-full bg-primary"
                  style={{ boxShadow: "0 0 8px hsl(var(--primary) / 0.4)" }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
