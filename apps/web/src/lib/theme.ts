export type ThemeColorId = 'orange' | 'blue' | 'emerald' | 'indigo' | 'crimson';

export interface ThemeOption {
  id: ThemeColorId;
  label: string;
  swatch: string;
  description: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'orange',
    label: 'Solution Art Orange',
    swatch: '#f5931e',
    description: 'Default company logo theme',
  },
  {
    id: 'blue',
    label: 'Ocean Blue',
    swatch: '#2563eb',
    description: 'Clean maritime blue',
  },
  {
    id: 'emerald',
    label: 'Emerald Green',
    swatch: '#059669',
    description: 'Crisp forest green',
  },
  {
    id: 'indigo',
    label: 'Royal Indigo',
    swatch: '#4f46e5',
    description: 'Deep modern indigo',
  },
  {
    id: 'crimson',
    label: 'Crimson Red',
    swatch: '#dc2626',
    description: 'Bold high-contrast red',
  },
];

const THEME_STORAGE_KEY = 'worklog:theme';
const DARK_STORAGE_KEY = 'worklog:dark';

export interface AppearancePrefs {
  theme: ThemeColorId;
  darkMode: boolean;
}

export function readAppearancePrefs(): AppearancePrefs {
  try {
    const rawTheme = window.localStorage.getItem(THEME_STORAGE_KEY) as ThemeColorId | null;
    const rawDark = window.localStorage.getItem(DARK_STORAGE_KEY);
    const validTheme = THEME_OPTIONS.some((t) => t.id === rawTheme) ? rawTheme! : 'orange';
    return {
      theme: validTheme,
      darkMode: rawDark === 'true',
    };
  } catch {
    return { theme: 'orange', darkMode: false };
  }
}

export function applyAppearancePrefs(prefs: AppearancePrefs): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', prefs.theme);
  if (prefs.darkMode) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, prefs.theme);
    window.localStorage.setItem(DARK_STORAGE_KEY, String(prefs.darkMode));
  } catch {
    // Ignore storage errors
  }
}
