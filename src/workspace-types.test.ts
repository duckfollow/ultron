import test from "node:test";
import assert from "node:assert/strict";
import { makePane, makeTab, makeUtopPane } from "./workspace-types.ts";

test("Utop tabs contain monitor panes with no terminal or SSH session", () => {
  const monitor = makeUtopPane();
  const tab = makeTab(2, monitor);
  assert.equal(tab.panes[0], monitor);
  assert.equal(monitor.kind, "utop");
  assert.equal(monitor.state, "live");
  assert.equal(monitor.info, undefined);
  assert.equal(monitor.sshProfile, undefined);
  assert.deepEqual(tab.layout, { type: "pane", id: monitor.id });
  assert.equal(tab.activePane, monitor.id);
  const terminal = makePane();
  assert.notEqual(terminal.kind, "utop");
  assert.equal(terminal.state, "starting");
  assert.notEqual(terminal.id, monitor.id);
});
