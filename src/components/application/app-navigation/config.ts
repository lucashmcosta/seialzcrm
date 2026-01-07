import type { ComponentType, ReactNode } from "react";

export interface NavItemType {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  badge?: number | ReactNode;
  items?: NavItemType[];
}

export interface SidebarNavigationProps {
  items: NavItemType[];
  footerItems?: NavItemType[];
  featureCard?: ReactNode;
  logo?: ReactNode;
  userSection?: ReactNode;
}
