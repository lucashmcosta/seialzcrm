import type { ReactNode } from "react";
import { CaretDoubleLeft, CaretDoubleRight } from "@phosphor-icons/react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { uiText } from "@/lib/ui-locale";
import type { NavItemType, SidebarNavigationProps } from "../config";
import { SidebarNavItem } from "./sidebar-nav-item";
import { SidebarNavGroup } from "./sidebar-nav-group";

export const SidebarNavigationSimple = ({
  items,
  footerItems,
  featureCard,
  logo,
  userSection,
  collapsed = false,
  onToggleCollapsed,
  collapsedLogo,
  collapsedUserSection,
}: SidebarNavigationProps) => {
  const renderNavItem = (item: NavItemType) => {
    // Recolhido: grupo vira um ícone que leva à página do grupo (sem submenu).
    if (collapsed) {
      return <SidebarNavItem key={item.href} item={item} collapsed />;
    }
    if (item.items && item.items.length > 0) {
      return <SidebarNavGroup key={item.href} item={item} />;
    }
    return <SidebarNavItem key={item.href} item={item} />;
  };

  return (
    <div className={cn("flex h-full flex-col border-r bg-card transition-[width] duration-200", collapsed ? "w-16" : "w-64")}>
      {/* Header / Logo */}
      {(collapsed ? collapsedLogo : logo) && (
        <div className={cn("flex py-5 items-center justify-center", collapsed ? "px-2" : "px-4")}>
          {collapsed ? collapsedLogo : logo}
        </div>
      )}
      {onToggleCollapsed && (
        <div className={cn("flex px-3", collapsed ? "justify-center" : "justify-end")}>
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            title={collapsed ? uiText("Expandir menu") : uiText("Recolher menu")}
            aria-label={collapsed ? uiText("Expandir menu") : uiText("Recolher menu")}
            aria-expanded={!collapsed}
          >
            {collapsed ? <CaretDoubleRight size={16} /> : <CaretDoubleLeft size={16} />}
          </button>
        </div>
      )}

      {/* Main Navigation */}
      <ScrollArea className={cn("flex-1 py-4", collapsed ? "px-2" : "px-3")}>
        <nav className="space-y-1">
          {items.map(renderNavItem)}
        </nav>
      </ScrollArea>

      {/* Feature Card */}
      {featureCard && !collapsed && (
        <div className="px-3 pb-3">
          {featureCard}
        </div>
      )}

      {/* Footer Items */}
      {footerItems && footerItems.length > 0 && (
        <>
          <Separator />
          <div className={cn("py-3", collapsed ? "px-2" : "px-3")}>
            <nav className="space-y-1">
              {footerItems.map((item) => (
                <SidebarNavItem key={item.href} item={item} collapsed={collapsed} />
              ))}
            </nav>
          </div>
        </>
      )}

      {/* User Section */}
      {(collapsed ? collapsedUserSection : userSection) && (
        <>
          <Separator />
          <div className={collapsed ? "p-2" : "p-3"}>
            {collapsed ? collapsedUserSection : userSection}
          </div>
        </>
      )}
    </div>
  );
};
