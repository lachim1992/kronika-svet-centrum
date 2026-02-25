import { Home, Globe, Shield, Newspaper, BookOpen, Crown, Swords, BarChart3, Timer, Wrench, Map, Zap } from "lucide-react";

export type TabId = "home" | "world" | "worldmap" | "realm" | "army" | "economy" | "feed" | "codex" | "wiki" | "council" | "engine" | "persistent" | "dev";

interface Props {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  showDevTab?: boolean;
  showPersistentTab?: boolean;
}

const baseTabs: { id: TabId; label: string; icon: React.ElementType }[] = [
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
  let tabs = [...baseTabs];
  if (showPersistentTab) tabs.push(persistentTab);
  if (showDevTab) tabs.push(devTab);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border backdrop-blur-md"
      style={{ background: "hsl(220 28% 8% / 0.95)" }}
    >
      <div className="flex items-center justify-around max-w-2xl mx-auto h-16 px-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center gap-1 px-2.5 py-1.5 rounded-lg transition-all duration-200 relative ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={isActive ? 2.2 : 1.5} />
              <span className="text-[9px] uppercase tracking-[0.12em]" style={{ fontFamily: "'Cinzel', serif" }}>{tab.label}</span>
              {isActive && (
                <span className="absolute -bottom-1 w-8 h-[3px] rounded-full bg-primary" 
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
