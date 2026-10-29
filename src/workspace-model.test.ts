import { test } from "node:test";
import assert from "node:assert/strict";
import {
  splitLayout,
  swapPanePositions,
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
  assert.equal(tabName("server running", " Backend "), "Backend");
  assert.equal(tabName("new directory", "Backend"), "Backend");
  assert.equal(tabName("Shell", "  "), "Terminal");
  assert.equal(tabName("project"), "project");
});

test("swapping monitor and terminal positions keeps pane IDs, split ratios, and sessions stable", () => {
  const mixed = resizeSplit(
    splitLayout(start, "original", "utop", "mixed", "columns"),
    "mixed",
    0.4,
  );
  const swapped = swapPanePositions(mixed, "original", "utop");
  const before = layoutRects(mixed),
    after = layoutRects(swapped);
  assert.deepEqual(after.panes.get("utop"), before.panes.get("original"));
  assert.deepEqual(after.panes.get("original"), before.panes.get("utop"));
  assert.equal(after.dividers[0].ratio, 0.4);
  assert.deepEqual(removePane(swapped, "utop"), start);
  assert.equal(swapPanePositions(mixed, "original", "missing"), mixed);
  assert.equal(swapPanePositions(mixed, "utop", "utop"), mixed);
});

test("reordering tabs preserves session objects, layouts, and the original array", async () => {
  const { reorderRelative } = await import("./order-model.ts");
  const a = { id: "a", layout: start },
    b = { id: "b", layout: { type: "pane" as const, id: "other" } },
    c = { id: "c", layout: start };
  const original = [a, b, c];
  const moved = reorderRelative(original, "a", "c", true, (item) => item.id);
  assert.deepEqual(moved, [b, c, a]);
  assert.equal(moved[2], a);
  assert.equal(moved[2].layout, start);
  assert.deepEqual(original, [a, b, c]);
  assert.deepEqual(
    reorderRelative(moved, "a", "b", false, (item) => item.id),
    original,
  );
  assert.equal(
    reorderRelative(original, "missing", "a", true, (item) => item.id),
    original,
  );
  assert.equal(
    reorderRelative(original, "a", "a", false, (item) => item.id),
    original,
  );
  assert.equal(
    reorderRelative(original, "a", "b", false, (item) => item.id),
    original,
  );
});
