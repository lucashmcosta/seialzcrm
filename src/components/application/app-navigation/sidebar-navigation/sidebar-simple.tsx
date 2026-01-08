import type { ReactNode } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { NavItemType, SidebarNavigationProps } from "../config";
import { SidebarNavItem } from "./sidebar-nav-item";
import { SidebarNavGroup } from "./sidebar-nav-group";

export const SidebarNavigationSimple = ({
  items,
  footerItems,
  featureCard,
  logo,
  userSection,
}: SidebarNavigationProps) => {
  const renderNavItem = (item: NavItemType) => {
    if (item.items && item.items.length > 0) {
      return <SidebarNavGroup key={item.href} item={item} />;
    }
    return <SidebarNavItem key={item.href} item={item} />;
  };

  return (
    <div className="flex h-full w-64 flex-col border-r bg-card">
      {/* Header / Logo */}
      {logo && (
        <div className="flex py-5 items-center px-4">
          {logo}
        </div>
      )}

      {/* Main Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {items.map(renderNavItem)}
        </nav>
      </ScrollArea>

      {/* Feature Card */}
      {featureCard && (
        <div className="px-3 pb-3">
          {featureCard}
        </div>
      )}

      {/* Footer Items */}
      {footerItems && footerItems.length > 0 && (
        <>
          <Separator />
          <div className="px-3 py-3">
            <nav className="space-y-1">
              {footerItems.map((item) => (
                <SidebarNavItem key={item.href} item={item} />
              ))}
            </nav>
          </div>
        </>
      )}

      {/* User Section */}
      {userSection && (
        <>
          <Separator />
          <div className="p-3">
            {userSection}
          </div>
        </>
      )}
    </div>
  );
};
