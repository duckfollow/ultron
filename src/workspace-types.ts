import type { SessionInfo } from "./TerminalPane";
import type { Layout, TabColor } from "./workspace-model";
export type Pane = {
  id: string;
  title: string;
  state: "starting" | "live" | "ended";
  info?: SessionInfo;
  error?: string;
  cols: number;
  rows: number;
};
export type Tab = {
  key: string;
  number: number;
  customName?: string;
  color: TabColor;
  panes: Pane[];
  layout: Layout;
  activePane: string;
};
export const makePane = (): Pane => ({
  id: crypto.randomUUID(),
  title: "Shell",
  state: "starting",
  cols: 80,
  rows: 24,
});
export function makeTab(number: number): Tab {
  const pane = makePane();
  return {
    key: crypto.randomUUID(),
    number,
    color: "red",
    panes: [pane],
    layout: { type: "pane", id: pane.id },
    activePane: pane.id,
  };
}
