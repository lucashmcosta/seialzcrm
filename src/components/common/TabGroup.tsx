import React, { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

/**
 * TabGroup Component
 * Standardized tab navigation with pill styling.
 * Part of the Base44 Design System.
 * Supports horizontal scrolling on mobile with swipe gestures.
 *
 * @param tabs - Array of tab objects with { id, label, badge }
 * @param activeTab - Currently active tab id
 * @param onTabChange - Tab change handler
 * @param className - Additional classes for container
 */

interface Tab {
  id: string;
  label: string;
  badge?: number;
}

interface TabGroupProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
}

export const TabGroup: React.FC<TabGroupProps> = ({
  tabs = [],
  activeTab,
  onTabChange,
  className,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);

  // Scroll active tab into view when it changes
  useEffect(() => {
    if (activeTabRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const activeTabEl = activeTabRef.current;
      const containerRect = container.getBoundingClientRect();
      const tabRect = activeTabEl.getBoundingClientRect();

      // Check if tab is outside visible area
      if (tabRect.left < containerRect.left || tabRect.right > containerRect.right) {
        activeTabEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }, [activeTab]);

  return (
    <div
      ref={scrollRef}
      className={cn(
        'inline-flex items-center rounded-full bg-muted p-1 overflow-x-auto scrollbar-hide',
        className
      )}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          ref={tab.id === activeTab ? activeTabRef : null}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            'rounded-full px-4 md:px-6 py-2 text-xs md:text-sm font-medium transition-all whitespace-nowrap relative flex-shrink-0',
            tab.id === activeTab
              ? 'bg-background text-primary shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {tab.label}
          {tab.badge && tab.badge > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
              {tab.badge > 99 ? '99+' : tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
};
