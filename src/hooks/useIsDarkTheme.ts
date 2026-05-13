import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;

function emitChange() {
  listeners.forEach((listener) => listener());
}

function getSnapshot(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  return document.documentElement.classList.contains('dark');
}

function getServerSnapshot(): boolean {
  return false;
}

function ensureObserver() {
  if (typeof document === 'undefined' || observer) {
    return;
  }

  observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.type === 'attributes' && mutation.attributeName === 'class')) {
      emitChange();
    }
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
}

function cleanupObserverIfUnused() {
  if (!observer || listeners.size > 0) {
    return;
  }

  observer.disconnect();
  observer = null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  ensureObserver();

  return () => {
    listeners.delete(listener);
    cleanupObserverIfUnused();
  };
}

export function useIsDarkTheme(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
