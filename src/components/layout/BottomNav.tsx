import { Home, Globe, Shield, Newspaper, Library, Wrench, BookOpen, Crown, Swords, BarChart3, Timer } from "lucide-react";

export type TabId = "home" | "world" | "realm" | "army" | "economy" | "feed" | "codex" | "wiki" | "council" | "persistent" | "dev";

interface Props {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  showDevTab?: boolean;
  showPersistentTab?: boolean;
}

const baseTabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "home", label: "My Realm", icon: Home },
  { id: "world", label: "World", icon: Globe },
  { id: "realm", label: "Realm", icon: Shield },
  { id: "army", label: "Army", icon: Swords },
  { id: "economy", label: "Economy", icon: BarChart3 },
  { id: "council", label: "Council", icon: Crown },
  { id: "feed", label: "Whispers", icon: Newspaper },
  { id: "wiki", label: "ChroWiki", icon: BookOpen },
];

const devTab = { id: "dev" as TabId, label: "Dev", icon: Wrench };
const persistentTab = { id: "persistent" as TabId, label: "Persistent", icon: Timer };

const BottomNav = ({ activeTab, onTabChange, showDevTab = false, showPersistentTab = false }: Props) => {
  let tabs = [...baseTabs];
  if (showPersistentTab) tabs.push(persistentTab);
  if (showDevTab) tabs.push(devTab);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-sm border-t border-border shadow-lg">
      <div className="flex items-center justify-around max-w-xl mx-auto h-16">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 transition-colors relative ${
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? "drop-shadow-sm" : ""}`} />
              <span className="text-[9px] font-display font-semibold">{tab.label}</span>
              {isActive && (
                <span className="absolute bottom-0 w-8 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
