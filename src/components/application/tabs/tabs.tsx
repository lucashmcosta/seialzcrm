import * as React from "react";
import {
  Tabs as AriaTabs,
  TabList as AriaTabList,
  Tab as AriaTab,
  TabPanel as AriaTabPanel,
  type TabsProps as AriaTabsProps,
  type TabListProps as AriaTabListProps,
  type TabProps as AriaTabProps,
  type TabPanelProps as AriaTabPanelProps,
  type Key,
} from "react-aria-components";
import { cn } from "@/lib/utils";

// ============ TABS ROOT ============
interface TabsProps extends AriaTabsProps {
  className?: string;
  children: React.ReactNode;
}

function Tabs({ className, children, ...props }: TabsProps) {
  return (
    <AriaTabs
      className={cn("w-full", className)}
      {...props}
    >
      {children}
    </AriaTabs>
  );
}

// ============ TAB LIST ============
interface TabItem {
  id: string;
  label: string;
  badge?: number;
}

interface TabListProps<T extends TabItem> extends Omit<AriaTabListProps<T>, 'children'> {
  type?: "default" | "underline" | "pills";
  items: T[];
  children: (item: T) => React.ReactNode;
  className?: string;
}

function TabList<T extends TabItem>({ 
  type = "underline", 
  items, 
  children, 
  className,
  ...props 
}: TabListProps<T>) {
  const baseStyles = "flex";
  
  const typeStyles = {
    default: "gap-1 bg-muted p-1 rounded-lg",
    underline: "gap-0 border-b border-border",
    pills: "gap-2",
  };

  return (
    <AriaTabList
      items={items}
      className={cn(baseStyles, typeStyles[type], className)}
      {...props}
    >
      {children}
    </AriaTabList>
  );
}

// ============ TAB ITEM ============
interface TabItemProps extends AriaTabProps {
  label: string;
  badge?: number;
  className?: string;
}

function TabItem({ id, label, badge, className, ...props }: TabItemProps) {
  return (
    <AriaTab
      id={id}
      className={({ isSelected, isFocusVisible }) =>
        cn(
          // Base styles
          "relative px-4 py-2.5 text-sm font-medium outline-none cursor-pointer transition-colors",
          // Default state
          "text-muted-foreground hover:text-foreground",
          // Selected state - underline style
          isSelected && [
            "text-foreground",
            "after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary",
          ],
          // Focus state
          isFocusVisible && "ring-2 ring-ring ring-offset-2 rounded-sm",
          className
        )
      }
      {...props}
    >
      <span className="flex items-center gap-2">
        {label}
        {badge !== undefined && badge > 0 && (
          <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-xs font-medium rounded-full bg-primary text-primary-foreground">
            {badge}
          </span>
        )}
      </span>
    </AriaTab>
  );
}

// ============ TAB PANEL ============
interface TabPanelProps extends AriaTabPanelProps {
  className?: string;
  children: React.ReactNode;
}

function TabPanel({ className, children, ...props }: TabPanelProps) {
  return (
    <AriaTabPanel
      className={cn("mt-4 outline-none", className)}
      {...props}
    >
      {children}
    </AriaTabPanel>
  );
}

// ============ COMPOUND COMPONENT ============
const TabsCompound = Object.assign(Tabs, {
  List: TabList,
  Item: TabItem,
  Panel: TabPanel,
});

export { TabsCompound as Tabs, type Key };
