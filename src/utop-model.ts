export interface ProcessSample {
  pid: number;
  name: string;
  cpu: number | null;
  memory: number | null;
  status: string;
}
export interface NetworkSample {
  name: string;
  received: number | null;
  transmitted: number | null;
  totalReceived: number;
  totalTransmitted: number;
}
export interface SystemSnapshot {
  sampledAt: number;
  host: string;
  os: string;
  cpuName: string;
  cpuPercent: number | null;
  cores: number[];
  totalMemory: number;
  usedMemory: number;
  totalSwap: number;
  usedSwap: number;
  uptime: number;
  load: number[];
  processes: ProcessSample[];
  networks: NetworkSample[];
  disks: { name: string; mount: string; total: number; available: number }[];
}
export interface HistoryPoint {
  time: number;
  cpu: number | null;
  memory: number;
  networks: Record<string, { down: number | null; up: number | null }>;
}
export function percent(value: number, total: number) {
  return total > 0 ? Math.max(0, Math.min(100, (value / total) * 100)) : 0;
}
export function bytes(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let size = Math.max(0, value),
    unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(unit === 0 ? 0 : size >= 100 ? 0 : 1)} ${units[unit]}`;
}
export function uptime(seconds: number) {
  const days = Math.floor(seconds / 86400),
    hours = Math.floor(seconds / 3600) % 24,
    minutes = Math.floor(seconds / 60) % 60;
  return `${days ? `${days}d ` : ""}${hours}h ${minutes}m`;
}
export function appendHistory(
  history: HistoryPoint[],
  snapshot: SystemSnapshot,
): HistoryPoint[] {
  if (history.at(-1)?.time === snapshot.sampledAt) return history;
  const networks = Object.fromEntries(
    snapshot.networks.map((network) => [
      network.name,
      { down: network.received, up: network.transmitted },
    ]),
  );
  return [
    ...history.filter((point) => point.time >= snapshot.sampledAt - 120_000),
    {
      time: snapshot.sampledAt,
      cpu: snapshot.cpuPercent,
      memory: percent(snapshot.usedMemory, snapshot.totalMemory),
      networks,
    },
  ].slice(-121);
}
export function processRows(
  processes: ProcessSample[],
  query: string,
  sort: "cpu" | "memory" | "pid" | "name",
  ascending: boolean,
): ProcessSample[] {
  const needle = query.trim().toLocaleLowerCase();
  return processes
    .filter((process) =>
      `${process.pid} ${process.name} ${process.status}`
        .toLocaleLowerCase()
        .includes(needle),
    )
    .sort((a, b) => {
      const comparison =
        sort === "name"
          ? a.name.localeCompare(b.name)
          : sort === "cpu"
            ? (a.cpu ?? -1) - (b.cpu ?? -1)
            : (a[sort] ?? -1) - (b[sort] ?? -1);
      return (ascending ? comparison : -comparison) || a.pid - b.pid;
    });
}
