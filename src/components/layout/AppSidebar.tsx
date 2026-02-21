import {
  Home, Globe, Shield, Swords, BarChart3, Crown,
  Newspaper, BookOpen, Timer, Wrench, PanelLeftClose, PanelLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import type { TabId } from "./BottomNav";
import ChronicleHubLogo from "@/components/ChronicleHubLogo";

interface AppSidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
  showDevTab?: boolean;
  showPersistentTab?: boolean;
  worldName?: string;
}

const navItems: { id: TabId; label: string; icon: React.ElementType; group: string }[] = [
  { id: "home", label: "My Realm", icon: Home, group: "main" },
  { id: "world", label: "World", icon: Globe, group: "main" },
  { id: "realm", label: "Provinces", icon: Shield, group: "main" },
  { id: "army", label: "Armies", icon: Swords, group: "main" },
  { id: "economy", label: "Economy", icon: BarChart3, group: "main" },
  { id: "council", label: "Council", icon: Crown, group: "main" },
  { id: "feed", label: "Whispers", icon: Newspaper, group: "content" },
  { id: "wiki", label: "ChroWiki", icon: BookOpen, group: "content" },
];

const AppSidebar = ({
  activeTab,
  onTabChange,
  collapsed,
  onCollapse,
  showDevTab = false,
  showPersistentTab = false,
  worldName,
}: AppSidebarProps) => {
  const isMobile = useIsMobile();

  const allItems = [
    ...navItems,
    ...(showPersistentTab ? [{ id: "persistent" as TabId, label: "Persistent", icon: Timer, group: "system" }] : []),
    ...(showDevTab ? [{ id: "dev" as TabId, label: "Dev", icon: Wrench, group: "system" }] : []),
  ];

  const groups = {
    main: allItems.filter((i) => i.group === "main"),
    content: allItems.filter((i) => i.group === "content"),
    system: allItems.filter((i) => i.group === "system"),
  };

  // On mobile, sidebar is hidden (BottomNav handles nav)
  if (isMobile) return null;

  return (
    <aside
      className={cn(
        "fixed top-0 left-0 h-screen z-30 flex flex-col border-r border-border transition-all duration-200",
        "bg-sidebar",
        collapsed ? "w-[56px]" : "w-[260px]"
      )}
    >
      {/* Logo area */}
      <div className="flex items-center gap-3 px-3 h-14 border-b border-sidebar-border shrink-0">
        <ChronicleHubLogo variant="mark" size="sm" />
        {!collapsed && (
          <span className="font-display font-semibold text-sm text-primary truncate">
            {worldName || "Chronicle Hub"}
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {Object.entries(groups).map(([groupKey, items]) =>
          items.length > 0 ? (
            <div key={groupKey} className="space-y-0.5">
              {!collapsed && groupKey !== "main" && (
                <div className="px-2 pb-1 text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">
                  {groupKey === "content" ? "Lore" : "System"}
                </div>
              )}
              {items.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onTabChange(item.id)}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-lg transition-all duration-150",
                      collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2",
                      active
                        ? "bg-sidebar-accent text-sidebar-primary border border-sidebar-primary/20"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground border border-transparent"
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon className={cn("shrink-0", collapsed ? "h-5 w-5" : "h-4 w-4")} strokeWidth={active ? 2.2 : 1.5} />
                    {!collapsed && (
                      <span className="text-sm font-medium truncate">{item.label}</span>
                    )}
                    {active && !collapsed && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-sidebar-primary" />
                    )}
                  </button>
                );
              })}
            </div>
          ) : null
        )}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => onCollapse(!collapsed)}
        className="flex items-center justify-center h-10 border-t border-sidebar-border text-muted-foreground hover:text-foreground transition-colors"
        title={collapsed ? "Rozbalit" : "Sbalit"}
      >
        {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
      </button>
    </aside>
  );
};

export default AppSidebar;
