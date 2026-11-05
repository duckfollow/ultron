import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveTheme,
  themePreference,
  terminalThemes,
} from "./theme-model.ts";

test("theme follows the system only when System is selected and handles invalid preferences", () => {
  for (const value of [null, undefined, "", "unknown", {}, 1])
    assert.equal(themePreference(value), "system");
  assert.equal(themePreference("dark"), "dark");
  assert.equal(themePreference("light"), "light");
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
});
function luminance(hex: string) {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(first: string, second: string) {
  const [low, high] = [luminance(first), luminance(second)].sort(
    (a, b) => a - b,
  );
  return (high + 0.05) / (low + 0.05);
}
test("terminal foreground, selections, and ANSI palettes remain readable in both themes", () => {
  const ansi = [
    "black",
    "red",
    "green",
    "yellow",
    "blue",
    "magenta",
    "cyan",
    "white",
    "brightBlack",
    "brightRed",
    "brightGreen",
    "brightYellow",
    "brightBlue",
    "brightMagenta",
    "brightCyan",
    "brightWhite",
  ] as const;
  for (const theme of Object.values(terminalThemes)) {
    assert.ok(contrast(theme.foreground!, theme.background!) >= 4.5);
    assert.ok(
      contrast(theme.selectionForeground!, theme.selectionBackground!) >= 4.5,
    );
    assert.ok(contrast(theme.cursor!, theme.background!) >= 3);
    // ANSI black retains its traditional dark value; colored output must remain distinguishable.
    for (const key of ansi.filter((k) => k !== "black"))
      assert.ok(
        contrast(theme[key]!, theme.background!) >= 3,
        `${key} contrast`,
      );
  }
});
