import { browser } from '$app/environment';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'atlas.night';
const LEGACY_STORAGE_KEY = 'theme';

function getSystemPreference(): Theme {
  if (!browser) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getInitialTheme(): Theme {
  if (!browser) return 'light';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === '1') return 'dark';
  if (stored === '0') return 'light';
  const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacy === 'dark' || legacy === 'light') return legacy;
  return getSystemPreference();
}

let theme = $state<Theme>(getInitialTheme());

function applyTheme(t: Theme): void {
  if (!browser) return;
  document.documentElement.classList.toggle('night', t === 'dark');
  // Atlas is the active design system. Remove the retired class so every page,
  // chart, keyboard shortcut, and WebMCP action reads the same appearance state.
  document.documentElement.classList.remove('dark');
  localStorage.setItem(STORAGE_KEY, t === 'dark' ? '1' : '0');
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}

// Apply on init (browser only)
if (browser) {
  applyTheme(getInitialTheme());
}

export function getTheme(): Theme {
  return theme;
}

export function toggleTheme(): void {
  setTheme(theme === 'light' ? 'dark' : 'light');
}

export function setTheme(next: Theme): boolean {
  const changed = theme !== next;
  theme = next;
  applyTheme(theme);
  return changed;
}

export function isDark(): boolean {
  return theme === 'dark';
}
