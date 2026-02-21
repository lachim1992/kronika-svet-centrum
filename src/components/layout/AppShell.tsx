import { ReactNode, useState } from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import AppSidebar from "./AppSidebar";
import BottomNav, { type TabId } from "./BottomNav";

interface AppShellProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  showDevTab?: boolean;
  showPersistentTab?: boolean;
  worldName?: string;
  header: ReactNode;
  resourceHud: ReactNode;
  children: ReactNode;
  bottomExtras?: ReactNode;
}

const AppShell = ({
  activeTab,
  onTabChange,
  showDevTab,
  showPersistentTab,
  worldName,
  header,
  resourceHud,
  children,
  bottomExtras,
}: AppShellProps) => {
  const isMobile = useIsMobile();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const sidebarWidth = isMobile ? 0 : sidebarCollapsed ? 56 : 260;

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar (desktop only) */}
      <AppSidebar
        activeTab={activeTab}
        onTabChange={onTabChange}
        collapsed={sidebarCollapsed}
        onCollapse={setSidebarCollapsed}
        showDevTab={showDevTab}
        showPersistentTab={showPersistentTab}
        worldName={worldName}
      />

      {/* Main area offset by sidebar width */}
      <div
        className="flex flex-col h-screen transition-all duration-200"
        style={{ marginLeft: sidebarWidth }}
      >
        {/* Sticky header + HUD */}
        <div className="sticky top-0 z-40 shrink-0">
          {header}
          {resourceHud}
        </div>

        {/* Scrollable content */}
        <main
          className={cn(
            "flex-1 overflow-y-auto",
            "px-4 py-4 space-y-4",
            isMobile && "pb-20" // leave room for BottomNav
          )}
        >
          {children}
        </main>
      </div>

      {/* Bottom nav (mobile only) */}
      {isMobile && (
        <BottomNav
          activeTab={activeTab}
          onTabChange={onTabChange}
          showDevTab={showDevTab}
          showPersistentTab={showPersistentTab}
        />
      )}

      {bottomExtras}
    </div>
  );
};

export default AppShell;
