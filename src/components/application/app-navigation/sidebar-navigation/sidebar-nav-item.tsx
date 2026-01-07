import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { NavItemType } from "../config";

interface SidebarNavItemProps {
  item: NavItemType;
  isSubItem?: boolean;
}

export const SidebarNavItem = ({ item, isSubItem = false }: SidebarNavItemProps) => {
  const location = useLocation();
  const isActive = location.pathname === item.href;
  const Icon = item.icon;

  const renderBadge = () => {
    if (!item.badge) return null;

    if (typeof item.badge === "number") {
      return (
        <motion.span
          key={item.badge}
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground"
        >
          {item.badge > 99 ? "99+" : item.badge}
        </motion.span>
      );
    }

    return <span className="ml-auto">{item.badge}</span>;
  };

  return (
    <Link
      to={item.href}
      className={cn(
        "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        isSubItem && "pl-10",
        isActive
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      )}
    >
      {isActive && (
        <motion.div
          layoutId="activeIndicator"
          className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-primary"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        />
      )}

      <Icon
        className={cn(
          "h-5 w-5 shrink-0 transition-colors",
          isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
        )}
      />

      <span className="truncate">{item.label}</span>

      {renderBadge()}
    </Link>
  );
};
