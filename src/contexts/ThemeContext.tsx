import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useOrganization } from '@/hooks/useOrganization';

interface ThemeContextType {
  primaryColor: string;
  sidebarColor: string;
  darkMode: boolean;
  setPrimaryColor: (color: string) => void;
  setSidebarColor: (color: string) => void;
  setDarkMode: (enabled: boolean) => void;
  isPreviewMode: boolean;
  setPreviewMode: (enabled: boolean) => void;
  setJustSaved: (saved: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const DEFAULT_PRIMARY = '206 50% 29%';
const DEFAULT_SIDEBAR = '0 0% 98%';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { organization } = useOrganization();
  
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_PRIMARY);
  const [sidebarColor, setSidebarColor] = useState(DEFAULT_SIDEBAR);
  const [darkMode, setDarkMode] = useState(false);
  const [isPreviewMode, setPreviewMode] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // Sync with organization settings
  useEffect(() => {
    if (organization && !isPreviewMode && !justSaved) {
      setPrimaryColor(organization.theme_primary_color || DEFAULT_PRIMARY);
      setSidebarColor(organization.theme_sidebar_color || DEFAULT_SIDEBAR);
      setDarkMode(organization.theme_dark_mode || false);
    }
    if (justSaved) {
      setJustSaved(false);
    }
  }, [organization, isPreviewMode, justSaved]);

  // Apply CSS variables and dark mode class
  useEffect(() => {
    const root = document.documentElement;
    
    // Set primary color
    root.style.setProperty('--primary', primaryColor);
    
    // Calculate primary-foreground based on luminosity
    const lightness = parseInt(primaryColor.split(' ')[2]?.replace('%', '') || '50');
    const foreground = lightness > 50 ? '217 33% 17%' : '0 0% 100%';
    root.style.setProperty('--primary-foreground', foreground);
    
    // Set sidebar background
    root.style.setProperty('--sidebar-background', sidebarColor);
    
    // Toggle dark mode
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [primaryColor, sidebarColor, darkMode]);

  return (
    <ThemeContext.Provider
      value={{
        primaryColor,
        sidebarColor,
        darkMode,
        setPrimaryColor,
        setSidebarColor,
        setDarkMode,
        isPreviewMode,
        setPreviewMode,
        setJustSaved,
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
