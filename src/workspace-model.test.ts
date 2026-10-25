import { test } from "node:test";
import assert from "node:assert/strict";
import {
  splitLayout,
  removePane,
  resizeSplit,
  layoutRects,
  tabName,
  type Layout,
} from "./workspace-model.ts";
const start: Layout = { type: "pane", id: "original" };
test("nested splits keep the original sessions and cover the full area without overlap", () => {
  const columns = splitLayout(start, "original", "right", "s1", "columns");
  const grid = splitLayout(columns, "right", "bottom", "s2", "rows");
  const { panes, dividers } = layoutRects(grid);
  assert.deepEqual([...panes.keys()], ["original", "right", "bottom"]);
  assert.deepEqual(panes.get("original"), {
    x: 0,
    y: 0,
    width: 0.5,
    height: 1,
  });
  assert.deepEqual(panes.get("bottom"), {
    x: 0.5,
    y: 0.5,
    width: 0.5,
    height: 0.5,
  });
  assert.equal(
    [...panes.values()].reduce((n, r) => n + r.width * r.height, 0),
    1,
  );
  assert.equal(dividers.length, 2);
  assert.deepEqual(start, { type: "pane", id: "original" });
});
test("closing a pane collapses its empty split while preserving other IDs and proportions", () => {
  const layout = resizeSplit(
    splitLayout(
      splitLayout(start, "original", "right", "s1", "columns"),
      "right",
      "bottom",
      "s2",
      "rows",
    ),
    "s1",
    0.7,
  );
  const result = removePane(layout, "right")!;
  assert.deepEqual(
    [...layoutRects(result).panes.keys()],
    ["original", "bottom"],
  );
  assert.equal(layoutRects(result).panes.get("original")!.width, 0.7);
  assert.deepEqual(removePane(result, "bottom"), start);
  assert.equal(removePane(start, "original"), null);
});
test("resizing stays bounded, affects only the chosen divider, and ignores invalid input", () => {
  const layout = splitLayout(
    splitLayout(start, "original", "right", "s1", "columns"),
    "right",
    "bottom",
    "s2",
    "rows",
  );
  const result = resizeSplit(layout, "s2", 9);
  const dividers = layoutRects(result).dividers;
  assert.equal(dividers.find((d) => d.id === "s1")!.ratio, 0.5);
  assert.equal(dividers.find((d) => d.id === "s2")!.ratio, 0.85);
  assert.deepEqual(resizeSplit(layout, "s2", NaN), layout);
});
test("custom tab names survive shell title changes and blank names restore automatic naming", () => {
  assert.equal(tabName(1, "server running", " Backend "), "Backend");
  assert.equal(tabName(1, "new directory", "Backend"), "Backend");
  assert.equal(tabName(2, "Shell", "  "), "Terminal 02");
  assert.equal(tabName(2, "project"), "02 · project");
});
