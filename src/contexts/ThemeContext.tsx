import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useOrganization } from '@/hooks/useOrganization';

type ThemePreset = 'default' | 'seialz';

interface ThemeContextType {
  primaryColor: string;
  sidebarColor: string;
  darkMode: boolean;
  themePreset: ThemePreset;
  setPrimaryColor: (color: string) => void;
  setSidebarColor: (color: string) => void;
  setDarkMode: (enabled: boolean) => void;
  setThemePreset: (preset: ThemePreset) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const DEFAULT_PRIMARY = '206 50% 29%';
const DEFAULT_SIDEBAR = '0 0% 98%';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { organization } = useOrganization();
  
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_PRIMARY);
  const [sidebarColor, setSidebarColor] = useState(DEFAULT_SIDEBAR);
  const [darkMode, setDarkMode] = useState(false);
  const [themePreset, setThemePreset] = useState<ThemePreset>('default');

  // Sync with organization settings only when organization ID changes
  useEffect(() => {
    if (organization) {
      setPrimaryColor(organization.theme_primary_color || DEFAULT_PRIMARY);
      setSidebarColor(organization.theme_sidebar_color || DEFAULT_SIDEBAR);
      setDarkMode(organization.theme_dark_mode || false);
      // Read theme_preset from organization (cast as any since column may not exist yet)
      const preset = (organization as any).theme_preset as string | null;
      setThemePreset((preset === 'seialz' ? 'seialz' : 'default'));
    }
  }, [organization?.id]);

  // Apply theme preset class
  useEffect(() => {
    const root = document.documentElement;
    
    if (themePreset === 'seialz') {
      root.classList.add('theme-seialz');
      // Seialz theme is always dark — no need for separate dark mode toggle
      root.classList.remove('dark');
    } else {
      root.classList.remove('theme-seialz');
    }
  }, [themePreset]);

  // Apply CSS variables and dark mode class (only when NOT using seialz preset)
  useEffect(() => {
    const root = document.documentElement;
    
    if (themePreset === 'seialz') {
      // Seialz theme manages its own colors via CSS class — skip manual overrides
      // But still remove inline styles that may have been set by default theme
      root.style.removeProperty('--primary');
      root.style.removeProperty('--primary-foreground');
      root.style.removeProperty('--sidebar-background');
      return;
    }
    
    // Set primary color
    root.style.setProperty('--primary', primaryColor);
    
    // Calculate primary-foreground based on luminosity
    const lightness = parseInt(primaryColor.split(' ')[2]?.replace('%', '') || '50');
    const foreground = lightness > 65 ? '217 33% 17%' : '0 0% 100%';
    root.style.setProperty('--primary-foreground', foreground);
    
    // Set sidebar background
    root.style.setProperty('--sidebar-background', sidebarColor);
    
    // Toggle dark mode
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [primaryColor, sidebarColor, darkMode, themePreset]);

  return (
    <ThemeContext.Provider
      value={{
        primaryColor,
        sidebarColor,
        darkMode,
        themePreset,
        setPrimaryColor,
        setSidebarColor,
        setDarkMode,
        setThemePreset,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
