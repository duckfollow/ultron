import { useSyncExternalStore } from "react";
import {
  resolveTheme,
  themePreference,
  type ThemePreference,
} from "./theme-model";
const KEY = "ultron.theme";
let preference: ThemePreference = "system";
let systemDark = true;
const listeners = new Set<() => void>();
function apply() {
  const theme = resolveTheme(preference, systemDark);
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  for (const listener of listeners) listener();
}
export function initializeTheme() {
  try {
    preference = themePreference(localStorage.getItem(KEY));
  } catch {
    /* Use the system appearance. */
  }
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  systemDark = media.matches;
  media.addEventListener("change", (event) => {
    systemDark = event.matches;
    apply();
  });
  window.addEventListener("storage", (event) => {
    if (event.key === KEY || event.key === null) {
      preference = themePreference(event.newValue);
      apply();
    }
  });
  apply();
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getResolvedTheme = () => resolveTheme(preference, systemDark);
export function useAppearance() {
  const current = useSyncExternalStore(subscribe, () => preference);
  const resolved = useSyncExternalStore(subscribe, getResolvedTheme);
  return {
    preference: current,
    resolved,
    setPreference(value: ThemePreference) {
      preference = value;
      try {
        localStorage.setItem(KEY, value);
      } catch {
        /* Changes still apply for this session. */
      }
      apply();
    },
  };
}
