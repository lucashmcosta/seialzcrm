import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight } from "@untitledui/icons";
import { cn } from "@/lib/utils";
import type { NavItemType } from "../config";
import { SidebarNavItem } from "./sidebar-nav-item";

interface SidebarNavGroupProps {
  item: NavItemType;
}

export const SidebarNavGroup = ({ item }: SidebarNavGroupProps) => {
  const location = useLocation();
  const Icon = item.icon;

  const isChildActive = item.items?.some(
    (child) => location.pathname === child.href
  );
  const isParentActive = location.pathname === item.href;
  const isActive = isParentActive || isChildActive;

  const [isOpen, setIsOpen] = useState(isChildActive || false);

  useEffect(() => {
    if (isChildActive) {
      setIsOpen(true);
    }
  }, [isChildActive]);

  const renderBadge = () => {
    if (!item.badge) return null;

    if (typeof item.badge === "number") {
      return (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      );
    }

    return item.badge;
  };

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "group relative flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "text-foreground"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        )}
      >
        <Icon
          className={cn(
            "h-5 w-5 shrink-0 transition-colors",
            isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
          )}
        />

        <span className="flex-1 truncate text-left">{item.label}</span>

        {renderBadge()}

        <motion.div
          animate={{ rotate: isOpen ? 90 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="mt-1 space-y-1">
              {item.items?.map((subItem) => (
                <SidebarNavItem key={subItem.href} item={subItem} isSubItem />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
