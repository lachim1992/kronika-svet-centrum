import { Globe, Swords, Building2, Newspaper, User, Plus } from "lucide-react";

export type TabId = "world" | "civ" | "cities" | "feed" | "profile";

interface Props {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onAddAction: () => void;
}

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "world", label: "Svět", icon: Globe },
  { id: "civ", label: "Civ", icon: Swords },
  { id: "cities", label: "Města", icon: Building2 },
  { id: "feed", label: "Feed", icon: Newspaper },
  { id: "profile", label: "Profil", icon: User },
];

const BottomNav = ({ activeTab, onTabChange, onAddAction }: Props) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border shadow-lg">
      <div className="flex items-center justify-around max-w-xl mx-auto h-16 relative">
        {tabs.map((tab, i) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          // Insert FAB after index 1 (between Civ and Cities)
          if (i === 2) {
            return (
              <div key="fab-group" className="flex items-center gap-0">
                {/* FAB */}
                <button
                  onClick={onAddAction}
                  className="absolute -top-5 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors"
                  aria-label="Přidat akci"
                >
                  <Plus className="h-6 w-6" />
                </button>
              </div>
            );
          }

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-display">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
