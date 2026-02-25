import { Home, Globe, Shield, Newspaper, BookOpen, Crown, Swords, BarChart3, Timer, Wrench, Map, Zap, Scroll } from "lucide-react";

export type TabId = "home" | "world" | "worldmap" | "realm" | "army" | "economy" | "chronicles" | "feed" | "codex" | "wiki" | "council" | "engine" | "persistent" | "dev";

interface Props {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  showDevTab?: boolean;
  showPersistentTab?: boolean;
}

const leftTabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "home", label: "Říše", icon: Home },
  { id: "world", label: "Svět", icon: Globe },
  { id: "worldmap", label: "Mapa", icon: Map },
  { id: "realm", label: "Správa", icon: Shield },
  { id: "army", label: "Armáda", icon: Swords },
];

const rightTabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "economy", label: "Ekonomika", icon: BarChart3 },
  { id: "engine", label: "Engine", icon: Zap },
  { id: "council", label: "Rada", icon: Crown },
  { id: "feed", label: "Šepoty", icon: Newspaper },
  { id: "wiki", label: "ChroWiki", icon: BookOpen },
];

const devTab = { id: "dev" as TabId, label: "Dev", icon: Wrench };
const persistentTab = { id: "persistent" as TabId, label: "Persistent", icon: Timer };

const BottomNav = ({ activeTab, onTabChange, showDevTab = false, showPersistentTab = false }: Props) => {
  let extraTabs: typeof rightTabs = [];
  if (showPersistentTab) extraTabs.push(persistentTab);
  if (showDevTab) extraTabs.push(devTab);

  const isChroniclesActive = activeTab === "chronicles";

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border backdrop-blur-md"
      style={{ background: "hsl(220 28% 8% / 0.95)" }}
    >
      <div className="flex items-center justify-around max-w-2xl mx-auto h-16 px-1 relative">
        {/* Left tabs */}
        {leftTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg transition-all duration-200 relative ${
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

        {/* Center Chronicles pill button */}
        <button
          onClick={() => onTabChange("chronicles")}
          className="flex flex-col items-center gap-0.5 -mt-5 relative z-10"
        >
          <div
            className={`relative px-5 py-2.5 rounded-2xl flex items-center gap-2 border transition-all duration-300 ${
              isChroniclesActive
                ? "border-primary/60 shadow-[0_0_20px_hsl(var(--primary)/0.35),0_4px_12px_hsl(228_40%_3%/0.5)]"
                : "border-primary/25 hover:border-primary/45 shadow-[0_4px_12px_hsl(228_40%_3%/0.4)]"
            }`}
            style={{
              background: isChroniclesActive
                ? "linear-gradient(135deg, hsl(43 74% 42% / 0.25), hsl(224 34% 14% / 0.95), hsl(43 74% 42% / 0.15))"
                : "linear-gradient(135deg, hsl(43 74% 30% / 0.12), hsl(224 34% 12% / 0.95), hsl(43 74% 30% / 0.08))",
            }}
          >
            {/* Decorative corner accents */}
            <span className="absolute top-0.5 left-2 w-3 h-px rounded-full" style={{ background: `hsl(var(--primary) / ${isChroniclesActive ? 0.5 : 0.2})` }} />
            <span className="absolute bottom-0.5 right-2 w-3 h-px rounded-full" style={{ background: `hsl(var(--primary) / ${isChroniclesActive ? 0.5 : 0.2})` }} />

            <Scroll
              className={`h-5 w-5 transition-colors duration-200 ${
                isChroniclesActive ? "text-primary" : "text-primary/60"
              }`}
              strokeWidth={isChroniclesActive ? 2.2 : 1.5}
            />
            <span
              className={`text-[10px] uppercase tracking-[0.14em] font-semibold transition-colors duration-200 ${
                isChroniclesActive ? "text-primary" : "text-primary/60"
              }`}
              style={{ fontFamily: "'Cinzel', serif" }}
            >
              Kroniky
            </span>
          </div>
        </button>

        {/* Right tabs */}
        {[...rightTabs, ...extraTabs].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg transition-all duration-200 relative ${
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
