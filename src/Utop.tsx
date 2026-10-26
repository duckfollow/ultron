import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  Activity,
  Cpu,
  MemoryStick,
  Network,
  HardDrive,
  Search,
  Pause,
  Play,
  ArrowDown,
  ArrowUp,
  RefreshCw,
} from "lucide-react";
import {
  appendHistory,
  bytes,
  percent,
  processRows,
  uptime,
  type HistoryPoint,
  type SystemSnapshot,
} from "./utop-model";
import "./utop.css";

function Panel({
  title,
  icon,
  tone,
  children,
  className = "",
}: {
  title: string;
  icon: ReactNode;
  tone: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`utop-panel ${tone} ${className}`} aria-label={title}>
      <h3>
        {icon}
        {title}
        <span />
      </h3>
      {children}
    </section>
  );
}
function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="utop-meter"
      role="meter"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${value}%` }} />
    </div>
  );
}
function Graph({
  points,
  max = 100,
  title,
}: {
  points: { time: number; value: number | null }[];
  max?: number;
  title: string;
}) {
  const id = useId().replaceAll(":", "");
  const end = points.at(-1)?.time ?? 0;
  const paths: string[] = [];
  let path = "",
    previous = 0;
  for (const point of points) {
    if (point.value === null || !Number.isFinite(point.value)) {
      if (path) paths.push(path);
      path = "";
      continue;
    }
    if (previous && point.time - previous > 10_000) {
      if (path) paths.push(path);
      path = "";
    }
    const x = 600 - (Math.min(120_000, end - point.time) / 120_000) * 600;
    const y =
      100 - Math.max(0, Math.min(1, point.value / Math.max(1, max))) * 96;
    path += `${path ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)} `;
    previous = point.time;
  }
  if (path) paths.push(path);
  return (
    <svg
      className="utop-graph"
      viewBox="0 0 600 105"
      preserveAspectRatio="none"
      role="img"
      aria-labelledby={id}
    >
      <title id={id}>{title}</title>
      {[25, 50, 75, 100].map((y) => (
        <line
          key={y}
          x1="0"
          x2="600"
          y1={y}
          y2={y}
          className="utop-grid-line"
        />
      ))}
      {paths.map((path, i) => (
        <path
          key={i}
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
export function Utop({
  visible,
  previewSnapshot,
}: {
  visible: boolean;
  previewSnapshot?: SystemSnapshot;
}) {
  const [snapshot, setSnapshot] = useState<SystemSnapshot | null>(
    previewSnapshot ?? null,
  );
  const [history, setHistory] = useState<HistoryPoint[]>(
    previewSnapshot ? [appendHistory([], previewSnapshot)[0]] : [],
  );
  const [paused, setPaused] = useState(false),
    [interval, setIntervalMs] = useState(2000),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [networkName, setNetworkName] = useState("");
  const [sort, setSort] = useState<"cpu" | "memory" | "pid" | "name">("cpu"),
    [ascending, setAscending] = useState(false);
  const [retry, setRetry] = useState(0);
  const pending = useRef(false);
  useEffect(() => {
    if (previewSnapshot || !visible || paused) return;
    if (!isTauri()) {
      setError("Open the Ultron desktop app to view live local metrics.");
      return;
    }
    let cancelled = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    const sample = async () => {
      if (cancelled) return;
      if (document.hidden || pending.current) {
        timer = setTimeout(sample, interval);
        return;
      }
      pending.current = true;
      try {
        const next = await invoke<SystemSnapshot>("local_system_snapshot");
        if (!cancelled) {
          setSnapshot(next);
          setHistory((old) => appendHistory(old, next));
          setError("");
        }
      } catch (error) {
        if (!cancelled) setError(String(error));
      } finally {
        pending.current = false;
        if (!cancelled) timer = setTimeout(sample, interval);
      }
    };
    void sample();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [visible, paused, interval, retry, previewSnapshot]);
  const networks = snapshot?.networks ?? [];
  const network =
    networks.find((item) => item.name === networkName) ??
    networks.find((item) => item.name === "en0") ??
    networks.find((item) => !item.name.startsWith("lo")) ??
    networks[0];
  const rows = useMemo(
    () => processRows(snapshot?.processes ?? [], query, sort, ascending),
    [snapshot?.processes, query, sort, ascending],
  );
  const memoryPercent = percent(
    snapshot?.usedMemory ?? 0,
    snapshot?.totalMemory ?? 0,
  );
  const networkPoints = history.map((point) => ({
    time: point.time,
    value: network ? (point.networks[network.name]?.down ?? null) : null,
  }));
  const upPoints = history.map((point) => ({
    time: point.time,
    value: network ? (point.networks[network.name]?.up ?? null) : null,
  }));
  const networkMax = Math.max(
    1024,
    ...networkPoints.map((point) => point.value ?? 0),
    ...upPoints.map((point) => point.value ?? 0),
  );
  function changeSort(key: typeof sort) {
    if (sort === key) setAscending((value) => !value);
    else {
      setSort(key);
      setAscending(key === "name" || key === "pid");
    }
  }
  return (
    <div className="utop" hidden={!visible}>
      <header className="utop-heading">
        <div>
          <span className="utop-wordmark">
            u<span>top</span>
            <Activity size={18} />
          </span>
          <span className="utop-local">LOCAL MACHINE</span>
          <span className="utop-host">{snapshot?.host ?? "This Mac"}</span>
        </div>
        <div className="utop-controls">
          <label>
            Refresh
            <select
              aria-label="Monitor refresh interval"
              value={interval}
              onChange={(event) => setIntervalMs(Number(event.target.value))}
            >
              <option value={1000}>1s</option>
              <option value={2000}>2s</option>
              <option value={5000}>5s</option>
            </select>
          </label>
          <button
            onClick={() => setPaused((value) => !value)}
            aria-label={paused ? "Resume monitor" : "Pause monitor"}
          >
            {paused ? <Play size={12} /> : <Pause size={12} />}
            {paused ? "Resume" : "Pause"}
          </button>
        </div>
      </header>
      <div className="utop-system-line">
        <span>{snapshot?.os ?? "Reading local system…"}</span>
        <span>{snapshot ? `UP ${uptime(snapshot.uptime)}` : "Warming up"}</span>
        <span className={paused || error ? "utop-stale" : ""}>
          {paused
            ? "PAUSED · Last sample"
            : error
              ? "STALE · Last sample"
              : "LIVE"}
          {snapshot
            ? ` ${new Date(snapshot.sampledAt).toLocaleTimeString()}`
            : ""}
        </span>
      </div>
      {error && (
        <div className="utop-error" role="alert">
          <span>{error}</span>
          <button onClick={() => setRetry((value) => value + 1)}>
            <RefreshCw size={12} />
            Retry
          </button>
        </div>
      )}
      {!snapshot && !error && (
        <p className="utop-loading" role="status">
          Collecting local system information…
        </p>
      )}
      <div className="utop-layout">
        <Panel
          title="cpu"
          icon={<Cpu size={13} />}
          tone="utop-cpu"
          className="utop-cpu-panel"
        >
          <div className="utop-metric">
            <strong>
              {snapshot?.cpuPercent == null
                ? "—"
                : snapshot.cpuPercent.toFixed(1)}
              <small>%</small>
            </strong>
            <div>
              <b>{snapshot?.cpuName || "CPU"}</b>
              <span>
                {snapshot?.cpuPercent == null
                  ? "Measuring usage…"
                  : `${snapshot.cores.length} logical cores`}
              </span>
            </div>
          </div>
          <Graph
            points={history.map((point) => ({
              time: point.time,
              value: point.cpu,
            }))}
            title="Total CPU usage over the last 2 minutes"
          />
          <div className="utop-chart-labels">
            <span>−2 min</span>
            <span>Total CPU · 0–100%</span>
            <span>now</span>
          </div>
          <div className="utop-cores">
            {snapshot?.cores.map((usage, index) => (
              <div key={index}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <Meter value={usage} label={`Core ${index + 1} usage`} />
                <b>{usage.toFixed(0)}%</b>
              </div>
            ))}
          </div>
          <div className="utop-panel-note">
            Load average{" "}
            <b>
              {snapshot?.load.map((value) => value.toFixed(2)).join(" / ") ??
                "—"}
            </b>
            <span>1 / 5 / 15 min</span>
          </div>
        </Panel>
        <Panel
          title="memory"
          icon={<MemoryStick size={13} />}
          tone="utop-memory"
        >
          <div className="utop-metric">
            <strong>
              {snapshot ? memoryPercent.toFixed(1) : "—"}
              <small>%</small>
            </strong>
            <div>
              <b>{bytes(snapshot?.usedMemory ?? null)}</b>
              <span>of {bytes(snapshot?.totalMemory ?? null)} RAM</span>
            </div>
          </div>
          <Meter value={memoryPercent} label="Memory usage" />
          <Graph
            points={history.map((point) => ({
              time: point.time,
              value: point.memory,
            }))}
            title="Memory usage over the last 2 minutes"
          />
          <div className="utop-key-value">
            <span>Swap</span>
            <b>
              {bytes(snapshot?.usedSwap ?? null)} /{" "}
              {bytes(snapshot?.totalSwap ?? null)}
            </b>
          </div>
          <Meter
            value={percent(snapshot?.usedSwap ?? 0, snapshot?.totalSwap ?? 0)}
            label="Swap usage"
          />
        </Panel>
        <Panel title="network" icon={<Network size={13} />} tone="utop-network">
          <div className="utop-interface">
            <label>
              Interface
              <select
                aria-label="Network interface"
                value={network?.name ?? ""}
                onChange={(event) => setNetworkName(event.target.value)}
              >
                {!networks.length && <option value="">No interfaces</option>}
                {networks.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <span>Scale {bytes(networkMax)}/s</span>
          </div>
          <div className="utop-key-value">
            <span>
              <ArrowDown size={12} /> Download
            </span>
            <b>{bytes(network?.received ?? null)}/s</b>
          </div>
          <Graph
            points={networkPoints}
            max={networkMax}
            title="Download rate over the last 2 minutes"
          />
          <div className="utop-key-value utop-upload">
            <span>
              <ArrowUp size={12} /> Upload
            </span>
            <b>{bytes(network?.transmitted ?? null)}/s</b>
          </div>
          <div className="utop-upload">
            <Graph
              points={upPoints}
              max={networkMax}
              title="Upload rate over the last 2 minutes"
            />
          </div>
          <div className="utop-panel-note">
            Since boot
            <span>
              ↓ {bytes(network?.totalReceived ?? null)} · ↑{" "}
              {bytes(network?.totalTransmitted ?? null)}
            </span>
          </div>
        </Panel>
        <Panel title="disks" icon={<HardDrive size={13} />} tone="utop-disks">
          <div className="utop-disk-list">
            {snapshot?.disks.map((disk) => (
              <div key={disk.mount} className="utop-disk">
                <div>
                  <strong title={disk.mount}>{disk.mount}</strong>
                  <span>
                    {percent(disk.total - disk.available, disk.total).toFixed(
                      0,
                    )}
                    %
                  </span>
                </div>
                <Meter
                  value={percent(disk.total - disk.available, disk.total)}
                  label={`${disk.mount} disk usage`}
                />
                <div>
                  <span title={disk.name}>{disk.name}</span>
                  <span>
                    {bytes(disk.available)} free / {bytes(disk.total)}
                  </span>
                </div>
              </div>
            ))}
            {snapshot && !snapshot.disks.length && (
              <p>No mounted disks reported.</p>
            )}
          </div>
          <div className="utop-panel-note">
            APFS volumes may share capacity. Not summed.
          </div>
        </Panel>
        <Panel
          title="processes"
          icon={<Activity size={13} />}
          tone="utop-processes"
          className="utop-process-panel"
        >
          <div className="utop-process-tools">
            <span>
              {rows.length} / {snapshot?.processes.length ?? 0} processes
            </span>
            <label>
              <Search size={13} />
              <input
                aria-label="Search processes"
                placeholder="Search name or PID…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>
          <div className="utop-process-table">
            <table>
              <thead>
                <tr>
                  {(
                    [
                      ["pid", "PID"],
                      ["name", "Process"],
                      ["cpu", "CPU %"],
                      ["memory", "Memory"],
                    ] as const
                  ).map(([key, label]) => (
                    <th
                      key={key}
                      aria-sort={
                        sort === key
                          ? ascending
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <button onClick={() => changeSort(key)}>
                        {label}
                        {sort === key &&
                          (ascending ? (
                            <ArrowUp size={10} />
                          ) : (
                            <ArrowDown size={10} />
                          ))}
                      </button>
                    </th>
                  ))}
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((process) => (
                  <tr key={process.pid}>
                    <td>{process.pid}</td>
                    <td title={process.name}>{process.name}</td>
                    <td
                      className={
                        process.cpu != null && process.cpu >= 50
                          ? "utop-hot"
                          : ""
                      }
                    >
                      {process.cpu == null ? "—" : process.cpu.toFixed(1)}
                    </td>
                    <td>{bytes(process.memory)}</td>
                    <td>{process.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && (
              <p className="utop-no-processes">
                {snapshot
                  ? "No matching processes."
                  : "Waiting for process data…"}
              </p>
            )}
          </div>
          <div className="utop-panel-note">
            CPU: 100% = one core. RAM: resident. — = unavailable.
            <span>
              {rows.length > 200 ? "Showing first 200 matches" : "Read only"}
            </span>
          </div>
        </Panel>
      </div>
    </div>
  );
}
