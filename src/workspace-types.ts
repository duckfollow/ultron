import type { SessionInfo } from "./TerminalPane";
import type { Layout, TabColor } from "./workspace-model";
import type { SshProfile } from "./ssh-model";
export type Pane = {
  kind?: "terminal" | "utop";
  sshProfile?: SshProfile;
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
export const makeUtopPane = (): Pane => ({
  ...makePane(),
  kind: "utop",
  title: "Utop",
  state: "live",
});
export function makeTab(number: number, pane = makePane()): Tab {
  return {
    key: crypto.randomUUID(),
    number,
    color: "red",
    panes: [pane],
    layout: { type: "pane", id: pane.id },
    activePane: pane.id,
  };
}
