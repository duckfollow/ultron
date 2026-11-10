import {
  Box,
  HardDrive,
  ScrollText,
  GitBranch,
  Copy,
  Search,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  dockerComposeRows,
  dockerImageRows,
  dockerRows,
  diskRows,
  plainOutput,
  isLogCommand,
  logLines,
  gitStatus,
  gitCommits,
  isGitLogCommand,
  type RichResult,
} from "./rich-output";

const containerColumns = [
  ["name", "Name"],
  ["id", "Container ID"],
  ["image", "Image"],
  ["status", "Status"],
  ["health", "Health"],
  ["ports", "Ports"],
  ["uptime", "Uptime"],
] as const;

const imageColumns = [
  ["name", "Repository"],
  ["tag", "Tag"],
  ["id", "Image ID"],
  ["size", "Size"],
] as const;

const composeColumns = [
  ["name", "Name"],
  ["service", "Service"],
  ["image", "Image"],
  ["status", "Status"],
  ["ports", "Ports"],
] as const;

const diskColumns = [
  ["name", "Filesystem"],
  ["size", "Size"],
  ["used", "Used"],
  ["available", "Available"],
  ["usage", "Usage"],
  ["mount", "Mounted on"],
] as const;

const views = {
  containers: {
    columns: containerColumns,
    item: "container",
    title: "Docker containers",
    parse: dockerRows,
  },
  images: {
    columns: imageColumns,
    item: "image",
    title: "Docker images",
    parse: dockerImageRows,
  },
  compose: {
    columns: composeColumns,
    item: "container",
    title: "Compose services",
    parse: dockerComposeRows,
  },
  disk: {
    columns: diskColumns,
    item: "filesystem",
    title: "Disk usage",
    parse: diskRows,
  },
};

const commandViews = {
  "docker ps": views.containers,
  "docker ps -a": views.containers,
  "docker images": views.images,
  "docker compose ps": views.compose,
  df: views.disk,
  "df -h": views.disk,
};

export function RichOutput({
  result,
  onClose,
}: {
  result: RichResult;
  onClose: () => void;
}) {
  const command = result.command;
  const logs = isLogCommand(command);
  const git = command === "git status";
  const history = isGitLogCommand(command);
  const { columns, item, title, parse } =
    logs || git || history ? views.containers : commandViews[command];
  const Icon =
    git || history
      ? GitBranch
      : logs
        ? ScrollText
        : parse === diskRows
          ? HardDrive
          : Box;
  const [raw, setRaw] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{
    key: string;
    descending: boolean;
  }>({
    key: "name",
    descending: false,
  });
  const [notice, setNotice] = useState("");
  const rows = useMemo<Record<string, string>[] | null>(
    () =>
      !logs && !git && !history && result.code === 0 && !result.truncated
        ? parse(result.raw)
        : null,
    [logs, git, history, parse, result],
  );
  const lines = useMemo(
    () =>
      logs && result.code === 0 && !result.truncated
        ? logLines(result.raw)
        : null,
    [logs, result],
  );
  const [logLimit, setLogLimit] = useState(200);
  const search = query.trim().toLowerCase();
  const matchingLogs = lines?.filter(({ timestamp, message }) =>
    `${timestamp ?? ""} ${message}`.toLowerCase().includes(search),
  );
  const commits = useMemo(
    () =>
      history && result.code === 0 && !result.truncated
        ? gitCommits(result.raw)
        : null,
    [history, result],
  );
  const status = useMemo(
    () =>
      git && result.code === 0 && !result.truncated
        ? gitStatus(result.raw)
        : null,
    [git, result],
  );
  const filtered = rows
    ?.filter((row) =>
      Object.values(row).some((value) =>
        value.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    )
    .sort(
      (a, b) =>
        a[sort.key].localeCompare(b[sort.key], undefined, { numeric: true }) *
        (sort.descending ? -1 : 1),
    );

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Copied");
    } catch {
      setNotice("Unable to copy");
    }
  }

  return (
    <section
      className="rich-output"
      aria-label={
        history
          ? "Git history"
          : git
            ? "Git status"
            : logs
              ? "Docker logs"
              : title
      }
    >
      <header className="rich-output-header">
        <span className="rich-output-icon">
          <Icon size={18} aria-hidden="true" />
        </span>
        <div className="rich-output-title">
          <strong>
            {logs
              ? `Logs · ${command.split(" ").at(-1)}`
              : git
                ? "Git status"
                : history
                  ? "Git history"
                  : title}
          </strong>
          <code>{result.command}</code>
        </div>
        {(rows || lines || status || commits) && (
          <div
            className="rich-output-tabs"
            role="group"
            aria-label="Output view"
          >
            <button
              type="button"
              aria-pressed={!raw}
              onClick={() => setRaw(false)}
            >
              {history ? "Commits" : git ? "Changes" : logs ? "Logs" : "Table"}
            </button>
            <button
              type="button"
              aria-pressed={raw}
              onClick={() => setRaw(true)}
            >
              Raw
            </button>
          </div>
        )}
        <button
          className="rich-output-icon-button"
          type="button"
          title="Copy raw output"
          aria-label="Copy raw output"
          disabled={!result.raw || result.truncated}
          onClick={() => void copy(result.raw)}
        >
          <Copy size={15} />
        </button>
        <button
          className="rich-output-icon-button"
          type="button"
          title="Back to terminal"
          aria-label="Back to terminal"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </header>
      <div className="rich-output-body">
        {result.truncated ? (
          <p>Capture incomplete. View the output in the terminal.</p>
        ) : result.code === null ? (
          <p role="status">Running {result.command}…</p>
        ) : !raw && commits ? (
          <ol className="rich-output-commits" aria-label="Commits">
            {commits.map(({ hash, refs, author, date, message }, index) => (
              <li key={`${hash}-${index}`}>
                <strong>
                  {message.split(/\r?\n/, 1)[0] || "No commit message"}
                </strong>
                <div>
                  <code title={hash}>{hash.slice(0, 12)}</code>
                  {refs && <span>{refs}</span>}
                </div>
                <div>
                  <span>{author}</span>
                  <span>{date}</span>
                </div>
                {message.includes("\n") && (
                  <details>
                    <summary>Commit message</summary>
                    <pre>{message}</pre>
                  </details>
                )}
              </li>
            ))}
          </ol>
        ) : !raw && status ? (
          <>
            <div className="rich-output-tools">
              <GitBranch size={14} aria-hidden="true" />
              <strong>{status.branch}</strong>
            </div>
            {status.groups.some(({ files }) => files.length) ? (
              status.groups
                .filter(({ files }) => files.length)
                .map(({ label, files }) => (
                  <section className="rich-output-git-group" key={label}>
                    <h3>
                      {label} <span>{files.length}</span>
                    </h3>
                    <ul>
                      {files.map(({ path, change }, index) => (
                        <li key={index}>
                          {change && <span>{change}</span>}
                          <code>{path}</code>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))
            ) : (
              <p>Working tree is clean.</p>
            )}
          </>
        ) : !raw && matchingLogs ? (
          <>
            <div className="rich-output-tools">
              <label className="rich-output-search">
                <Search size={14} aria-hidden="true" />
                <input
                  aria-label="Search logs"
                  placeholder="Search logs…"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setLogLimit(200);
                  }}
                />
              </label>
              <span>
                {matchingLogs.length} of {lines?.length} lines
              </span>
            </div>
            {matchingLogs.length ? (
              <ol className="rich-output-logs" aria-label="Log lines">
                {matchingLogs
                  .slice(0, logLimit)
                  .map(({ index, timestamp, message, level }) => (
                    <li key={index} data-level={level}>
                      <span className="rich-output-log-number">
                        {index + 1}
                      </span>
                      {timestamp && (
                        <time dateTime={timestamp}>{timestamp}</time>
                      )}
                      <span>{message}</span>
                    </li>
                  ))}
              </ol>
            ) : (
              <p>{search ? "No matching log lines." : "No logs returned."}</p>
            )}
            {matchingLogs.length > logLimit && (
              <button
                className="rich-output-more-logs"
                type="button"
                onClick={() => setLogLimit(logLimit + 200)}
              >
                Show more lines
              </button>
            )}
          </>
        ) : raw || !rows ? (
          <>
            <p>
              {result.code !== 0
                ? `Command failed · exit ${result.code}`
                : "Exit 0"}
            </p>
            <pre>{plainOutput(result.raw)}</pre>
          </>
        ) : rows.length === 0 ? (
          <p>No {item}s found.</p>
        ) : (
          <>
            <div className="rich-output-tools">
              <label className="rich-output-search">
                <Search size={14} aria-hidden="true" />
                <input
                  aria-label={`Search ${item}s`}
                  placeholder={`Search ${item}s…`}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              {result.command === "df" && (
                <span>{result.raw.split(/\s+/)[1]}</span>
              )}
              <span>
                {query.trim()
                  ? `${filtered?.length ?? 0} of ${rows.length}`
                  : rows.length}{" "}
                {item}
                {rows.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="rich-output-table">
              {!filtered?.length && <p>No matching {item}s.</p>}
              <table>
                <thead>
                  <tr>
                    {columns.map(([key, title]) => (
                      <th
                        key={key}
                        scope="col"
                        aria-sort={
                          sort.key === key
                            ? sort.descending
                              ? "descending"
                              : "ascending"
                            : undefined
                        }
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setSort({
                              key,
                              descending: sort.key === key && !sort.descending,
                            })
                          }
                        >
                          {title}
                          {sort.key === key && (sort.descending ? " ↓" : " ↑")}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered?.map((row) => (
                    <tr
                      key={JSON.stringify([
                        row.id,
                        row.name,
                        row.tag,
                        row.mount,
                      ])}
                    >
                      {columns.map(([key, title]) => (
                        <td
                          key={key}
                          data-state={
                            key === "health"
                              ? row.health
                              : key === "status"
                                ? row.status.startsWith("Up ")
                                  ? "running"
                                  : row.status.startsWith("Exited ")
                                    ? "exited"
                                    : undefined
                                : undefined
                          }
                        >
                          {key === "usage" && row.usage !== "-" && (
                            <progress
                              className="rich-output-disk-meter"
                              aria-label={`Disk usage at ${row.mount}`}
                              max={100}
                              value={Math.min(
                                100,
                                Number.parseInt(row.usage, 10),
                              )}
                            />
                          )}
                          <span className="rich-output-value">
                            {row[key] || "—"}
                          </span>
                          {row[key] &&
                            (key === "name" ||
                              key === "id" ||
                              key === "ports" ||
                              key === "mount") && (
                              <button
                                className="rich-output-cell-copy"
                                title={`Copy ${title.toLowerCase()}`}
                                type="button"
                                aria-label={`Copy ${title} for ${row.name}`}
                                onClick={() => void copy(row[key])}
                              >
                                <Copy size={12} />
                              </button>
                            )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      <span className="rich-output-notice" role="status">
        {notice}
      </span>
    </section>
  );
}
