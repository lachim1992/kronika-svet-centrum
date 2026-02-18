import { Home, Globe, Shield, BookOpen, Library, Plus } from "lucide-react";

export type TabId = "home" | "world" | "realm" | "chronicle" | "codex";

interface Props {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onAddAction: () => void;
}

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "home", label: "Říše", icon: Home },
  { id: "world", label: "Svět", icon: Globe },
  { id: "realm", label: "Správa", icon: Shield },
  { id: "chronicle", label: "Kronika", icon: BookOpen },
  { id: "codex", label: "Kodex", icon: Library },
];

const BottomNav = ({ activeTab, onTabChange, onAddAction }: Props) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-sm border-t border-border shadow-lg">
      <div className="flex items-center justify-around max-w-xl mx-auto h-16 relative">
        {tabs.map((tab, i) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          // Insert FAB after index 1 (between World and Realm)
          const elements = [];

          if (i === 2) {
            elements.push(
              <button
                key="fab"
                onClick={onAddAction}
                className="absolute -top-5 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors z-10"
                aria-label="Přidat akci"
              >
                <Plus className="h-6 w-6" />
              </button>
            );
          }

          elements.push(
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? "drop-shadow-sm" : ""}`} />
              <span className="text-[10px] font-display font-semibold">{tab.label}</span>
              {isActive && (
                <span className="absolute bottom-0 w-8 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          );

          return elements;
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
