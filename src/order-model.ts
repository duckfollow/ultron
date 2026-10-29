export function reorderRelative<T>(
  items: T[],
  source: string,
  target: string,
  after: boolean,
  key: (item: T) => string,
): T[] {
  const from = items.findIndex((item) => key(item) === source);
  if (
    source === target ||
    from < 0 ||
    !items.some((item) => key(item) === target)
  )
    return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  const index = next.findIndex((item) => key(item) === target);
  next.splice(index + (after ? 1 : 0), 0, moved);
  return next.every((item, i) => item === items[i]) ? items : next;
}
