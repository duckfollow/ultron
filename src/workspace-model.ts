export type Axis = "columns" | "rows";
export type Layout =
  | { type: "pane"; id: string }
  | {
      type: "split";
      id: string;
      axis: Axis;
      ratio: number;
      first: Layout;
      second: Layout;
    };
export type Rect = { x: number; y: number; width: number; height: number };
export const colors = [
  { id: "red", name: "Red", value: "#f2747c" },
  { id: "orange", name: "Orange", value: "#e5a16e" },
  { id: "yellow", name: "Yellow", value: "#d8c177" },
  { id: "green", name: "Green", value: "#8bcba6" },
  { id: "cyan", name: "Cyan", value: "#84c9d0" },
  { id: "blue", name: "Blue", value: "#92b4ee" },
  { id: "purple", name: "Purple", value: "#bba0e3" },
] as const;
export type TabColor = (typeof colors)[number]["id"];
export function splitLayout(
  layout: Layout,
  target: string,
  paneId: string,
  splitId: string,
  axis: Axis,
): Layout {
  if (layout.type === "pane")
    return layout.id === target
      ? {
          type: "split",
          id: splitId,
          axis,
          ratio: 0.5,
          first: layout,
          second: { type: "pane", id: paneId },
        }
      : layout;
  return {
    ...layout,
    first: splitLayout(layout.first, target, paneId, splitId, axis),
    second: splitLayout(layout.second, target, paneId, splitId, axis),
  };
}
export function removePane(layout: Layout, id: string): Layout | null {
  if (layout.type === "pane") return layout.id === id ? null : layout;
  const first = removePane(layout.first, id),
    second = removePane(layout.second, id);
  return first && second ? { ...layout, first, second } : (first ?? second);
}
export function resizeSplit(layout: Layout, id: string, ratio: number): Layout {
  if (layout.type === "pane" || !Number.isFinite(ratio)) return layout;
  if (layout.id === id)
    return { ...layout, ratio: Math.max(0.15, Math.min(0.85, ratio)) };
  return {
    ...layout,
    first: resizeSplit(layout.first, id, ratio),
    second: resizeSplit(layout.second, id, ratio),
  };
}
export function layoutRects(
  layout: Layout,
  rect: Rect = { x: 0, y: 0, width: 1, height: 1 },
) {
  const panes = new Map<string, Rect>();
  const dividers: {
    id: string;
    axis: Axis;
    ratio: number;
    parent: Rect;
    rect: Rect;
  }[] = [];
  function walk(node: Layout, area: Rect) {
    if (node.type === "pane") {
      panes.set(node.id, area);
      return;
    }
    if (node.axis === "columns") {
      const width = area.width * node.ratio;
      walk(node.first, { ...area, width });
      walk(node.second, {
        ...area,
        x: area.x + width,
        width: area.width - width,
      });
      dividers.push({
        id: node.id,
        axis: node.axis,
        ratio: node.ratio,
        parent: area,
        rect: { ...area, x: area.x + width, width: 0 },
      });
    } else {
      const height = area.height * node.ratio;
      walk(node.first, { ...area, height });
      walk(node.second, {
        ...area,
        y: area.y + height,
        height: area.height - height,
      });
      dividers.push({
        id: node.id,
        axis: node.axis,
        ratio: node.ratio,
        parent: area,
        rect: { ...area, y: area.y + height, height: 0 },
      });
    }
  }
  walk(layout, rect);
  return { panes, dividers };
}
export function tabName(
  number: number,
  shellTitle: string,
  customName?: string,
) {
  return (
    customName?.trim() ||
    (shellTitle && shellTitle !== "Shell"
      ? `${String(number).padStart(2, "0")} · ${shellTitle}`
      : `Terminal ${String(number).padStart(2, "0")}`)
  );
}

// Exchange positions without replacing pane IDs or restarting their sessions.
export function swapPanePositions(
  layout: Layout,
  firstId: string,
  secondId: string,
): Layout {
  const ids = layoutRects(layout).panes;
  if (firstId === secondId || !ids.has(firstId) || !ids.has(secondId))
    return layout;
  const swap = (node: Layout): Layout =>
    node.type === "pane"
      ? {
          ...node,
          id:
            node.id === firstId
              ? secondId
              : node.id === secondId
                ? firstId
                : node.id,
        }
      : { ...node, first: swap(node.first), second: swap(node.second) };
  return swap(layout);
}
