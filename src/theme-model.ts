import type { ITheme } from "@xterm/xterm";
export type ThemePreference = "system" | "dark" | "light";
export type ResolvedTheme = "dark" | "light";
export function themePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}
export function resolveTheme(
  preference: ThemePreference,
  systemDark: boolean,
): ResolvedTheme {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}
export const terminalThemes: Record<ResolvedTheme, ITheme> = {
  dark: {
    background: "#101114",
    foreground: "#e2e3e7",
    cursor: "#ff686b",
    cursorAccent: "#101114",
    selectionBackground: "#5e333c",
    selectionForeground: "#ffffff",
    black: "#25262d",
    red: "#f27881",
    green: "#a0d5ad",
    yellow: "#e8ca91",
    blue: "#91b5ef",
    magenta: "#c2a1e4",
    cyan: "#8dced1",
    white: "#d4d6df",
    brightBlack: "#747887",
    brightRed: "#ff9aa2",
    brightGreen: "#b6efc2",
    brightYellow: "#ffe0a7",
    brightBlue: "#b6d2ff",
    brightMagenta: "#dfbfff",
    brightCyan: "#b6eeee",
    brightWhite: "#ffffff",
  },
  light: {
    background: "#f5f6f8",
    foreground: "#252b36",
    cursor: "#ad304c",
    cursorAccent: "#f5f6f8",
    selectionBackground: "#d9dfee",
    selectionForeground: "#202637",
    black: "#303541",
    red: "#ae283f",
    green: "#216b42",
    yellow: "#806017",
    blue: "#285ba9",
    magenta: "#8050a6",
    cyan: "#176c7b",
    white: "#656a75",
    brightBlack: "#606674",
    brightRed: "#bf344d",
    brightGreen: "#287b4a",
    brightYellow: "#886510",
    brightBlue: "#3269b8",
    brightMagenta: "#9058b5",
    brightCyan: "#237786",
    brightWhite: "#747985",
  },
};
