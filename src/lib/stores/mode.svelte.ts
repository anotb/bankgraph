import { browser } from '$app/environment';

type Mode = 'accessible' | 'power';

const STORAGE_KEY = 'bde-mode';

function getInitialMode(): Mode {
  if (!browser) return 'accessible';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'power' || stored === 'accessible') return stored;
  return 'accessible';
}

let mode = $state<Mode>(getInitialMode());

function applyMode(m: Mode): void {
  if (!browser) return;
  localStorage.setItem(STORAGE_KEY, m);
}

// Apply on init (browser only)
if (browser) {
  applyMode(getInitialMode());
}

export function getMode(): Mode {
  return mode;
}

export function toggleMode(): void {
  mode = mode === 'accessible' ? 'power' : 'accessible';
  applyMode(mode);
}

export function setMode(m: Mode): void {
  mode = m;
  applyMode(mode);
}
