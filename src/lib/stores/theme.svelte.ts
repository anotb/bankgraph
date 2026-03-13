import { browser } from '$app/environment';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

function getSystemPreference(): Theme {
  if (!browser) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getInitialTheme(): Theme {
  if (!browser) return 'light';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return getSystemPreference();
}

let theme = $state<Theme>(getInitialTheme());

function applyTheme(t: Theme): void {
  if (!browser) return;
  if (t === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  localStorage.setItem(STORAGE_KEY, t);
}

// Apply on init (browser only)
if (browser) {
  applyTheme(getInitialTheme());
}

export function getTheme(): Theme {
  return theme;
}

export function toggleTheme(): void {
  theme = theme === 'light' ? 'dark' : 'light';
  applyTheme(theme);
}

export function isDark(): boolean {
  return theme === 'dark';
}
