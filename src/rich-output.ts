const commands = [
  "docker ps",
  "docker ps -a",
  "docker images",
  "docker compose ps",
  "df",
  "df -h",
  "git status",
] as const;

export function isLogCommand(
  command: string,
): command is `docker logs ${string}` {
  return (
    /^docker logs (?:--tail [0-9]{1,9} )?(?:--timestamps )?[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(
      command,
    ) && !command.endsWith("\n")
  );
}

export function isGitLogCommand(
  command: string,
): command is `git ${string}log` | `git ${string}log -n ${string}` {
  return (
    /^git (?:--no-pager )?log(?: -n [1-9][0-9]{0,3})?$/.test(command) &&
    !command.endsWith("\n")
  );
}

export type RichResult = {
  command:
    | (typeof commands)[number]
    | `docker logs ${string}`
    | `git ${string}log`
    | `git ${string}log -n ${string}`;
  raw: string;
  code: number | null;
  truncated: boolean;
};

const marker = "\x1b]6973;";
// zsh draws its default end-of-line marker before running precmd hooks.
const zshPromptTail =
  /(?:^|(?<=\n))\x1b\[1m\x1b\[7m[%#]\x1b\[27m\x1b\[1m\x1b\[0m *\r \r$/;
const frameLimit = 256;
const captureLimit = 512 * 1024;

export function richCapture(update: (result: RichResult) => void) {
  const decoder = new TextDecoder();
  let tail = "";
  let active: RichResult | undefined;

  function append(value: string) {
    if (!active) return;
    const remaining = captureLimit - active.raw.length;
    active.raw += value.slice(0, remaining);
    if (value.length > remaining) active.truncated = true;
  }

  return {
    push(bytes: Uint8Array) {
      let input = tail + decoder.decode(bytes, { stream: true });
      tail = "";
      while (input) {
        const start = input.indexOf(marker);
        if (start < 0) {
          let split = Math.min(marker.length - 1, input.length);
          while (split && !marker.startsWith(input.slice(-split))) split--;
          append(input.slice(0, input.length - split));
          tail = split ? input.slice(-split) : "";
          return;
        }
        append(input.slice(0, start));
        const end = input.indexOf("\x07", start + marker.length);
        if (end < 0 || end - start > frameLimit) {
          if (end < 0 && input.length - start <= frameLimit) {
            tail = input.slice(start);
            return;
          }
          append(input[start]);
          input = input.slice(start + 1);
          continue;
        }
        const frame = input.slice(start + marker.length, end);
        input = input.slice(end + 1);
        const command =
          isLogCommand(frame) || isGitLogCommand(frame)
            ? frame
            : commands.find((value) => value === frame);
        if (command) {
          active = { command, raw: "", code: null, truncated: false };
          update({ ...active });
        } else if (active && /^exit=\d{1,3}$/.test(frame)) {
          update({
            ...active,
            raw: active.raw.replace(zshPromptTail, ""),
            code: Number(frame.slice(5)),
          });
          active = undefined;
        }
      }
    },
    finish() {
      append(tail + decoder.decode());
      if (active) update({ ...active, truncated: true });
      active = undefined;
      tail = "";
    },
  };
}

export type ContainerRow = {
  name: string;
  id: string;
  image: string;
  status: string;
  health: string;
  uptime: string;
  ports: string;
};

const headings = [
  "CONTAINER ID",
  "IMAGE",
  "COMMAND",
  "CREATED",
  "STATUS",
  "PORTS",
  "NAMES",
];

export function dockerRows(raw: string): ContainerRow[] | null {
  const [header, ...lines] = raw.trimEnd().split(/\r?\n/);
  if (header.trimEnd().split(/ {2,}/).join("|") !== headings.join("|"))
    return null;
  const starts = headings.map((heading) => header.indexOf(heading));
  const rows: ContainerRow[] = [];
  for (const line of lines) {
    const [id, image, , , status, ports, name] = starts.map((start, index) =>
      line.slice(start, starts[index + 1]).trim(),
    );
    if (
      !/^[a-f0-9]{12,64}$/.test(id) ||
      !image ||
      !status ||
      !/^[\w][\w.-]*$/.test(name) ||
      /[\x00-\x1f\x7f]/.test(line)
    )
      return null;
    rows.push({
      id,
      image,
      status,
      ports,
      name,
      health:
        status.match(/\((healthy|unhealthy|health: starting)\)/)?.[1] ?? "",
      uptime: status.match(/^Up (.*?)(?: \(|$)/)?.[1] ?? "",
    });
  }
  return rows;
}

const imageId = /^(?:sha256:)?[a-f0-9]{12,64}$/;

export function plainOutput(raw: string): string {
  return raw.replace(/\x1b\[[0-9;:]*m/g, "");
}

export function dockerImageRows(raw: string): Record<string, string>[] | null {
  const lines = plainOutput(raw).trim().split(/\r?\n/);
  // Docker's newer image table adds this legend when stdout is a terminal.
  const legend = /^ *Info *(?:->|→) +U +In Use *$/;
  if (lines[0] === "i" && legend.test(lines[1] ?? "")) lines.shift();
  if (legend.test(lines[0])) lines.shift();
  const header = lines.shift() ?? "";
  const format = header.trimEnd().split(/ {2,}/).join("|");
  const classic = format === "REPOSITORY|TAG|IMAGE ID|CREATED|SIZE";
  if (!classic && format !== "IMAGE|ID|DISK USAGE|CONTENT SIZE|EXTRA")
    return null;
  const rows: Record<string, string>[] = [];
  for (const line of lines) {
    if (/[\x00-\x1f\x7f]/.test(line)) return null;
    const fields = line.trim().split(/ {2,}/);
    if (classic) {
      const [name, tag, id, , size] = fields;
      if (fields.length !== 5 || !imageId.test(id) || !size) return null;
      rows.push({ name, tag, id, size });
    } else {
      const [reference, id, size, contentSize, extra = ""] = fields;
      if (fields.length < 4 || fields.length > 5 || !imageId.test(id))
        return null;
      const tagStart = reference.lastIndexOf(":");
      const hasTag =
        !reference.includes("@") && tagStart > reference.lastIndexOf("/");
      rows.push({
        name: hasTag ? reference.slice(0, tagStart) : reference,
        tag: hasTag ? reference.slice(tagStart + 1) : "",
        id,
        size,
        contentSize,
        extra,
      });
    }
  }
  return rows;
}

const composeHeadings = [
  "NAME",
  "IMAGE",
  "COMMAND",
  "SERVICE",
  "CREATED",
  "STATUS",
  "PORTS",
];

export function dockerComposeRows(
  raw: string,
): Record<string, string>[] | null {
  const [header, ...lines] = raw.trimEnd().split(/\r?\n/);
  if (header.trimEnd().split(/ {2,}/).join("|") !== composeHeadings.join("|"))
    return null;
  const starts = composeHeadings.map((heading) => header.indexOf(heading));
  const rows: Record<string, string>[] = [];
  for (const line of lines) {
    if (/[\x00-\x1f\x7f]/.test(line)) return null;
    const [name, image, , service, , status, ports] = starts.map(
      (start, index) => line.slice(start, starts[index + 1]).trim(),
    );
    if (!/^[\w][\w.-]*$/.test(name) || !image || !service || !status)
      return null;
    rows.push({ name, image, service, status, ports });
  }
  return rows;
}

export function diskRows(raw: string): Record<string, string>[] | null {
  const [header, ...lines] = raw.trimEnd().split(/\r?\n/);
  const layout =
    /^Filesystem\s+(Size|(?:\d+|\d+[KM])-blocks)\s+Used\s+(?:Avail|Available)\s+(?:Capacity|Use%)(\s+iused\s+ifree\s+%iused)?\s+Mounted on$/.exec(
      header,
    );
  if (!layout) return null;
  const amount = "(\\d+(?:\\.\\d+)?[KMGTPEZY]?(?:iB?|Bi?)?)";
  const inodes = layout[2] ? "\\s+\\S+\\s+\\S+\\s+\\S+" : "";
  const row = new RegExp(
    `^(.+?)\\s+${amount}\\s+${amount}\\s+${amount}\\s+(\\d+%|-)${inodes}\\s+(.+)$`,
  );
  const rows: Record<string, string>[] = [];
  for (const line of lines) {
    const match = row.exec(line);
    if (!match) return null;
    const [, name, size, used, available, usage, mount] = match;
    rows.push({ name, size, used, available, usage, mount });
  }
  return rows;
}

export function logLines(raw: string) {
  if (!raw) return [];
  return plainOutput(raw)
    .replace(/\r?\n$/, "")
    .split(/\r?\n/)
    .map((line, index) => {
      const timestamp =
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})(?= )/.exec(
          line,
        )?.[0];
      const message = timestamp ? line.slice(timestamp.length + 1) : line;
      const level = /\b(?:ERROR|FATAL|PANIC)\b/i.test(message)
        ? "error"
        : /\b(?:WARN|WARNING)\b/i.test(message)
          ? "warning"
          : undefined;
      return { index, timestamp, message, level };
    });
}

const statusSections = {
  "Changes to be committed:": "Staged",
  "Changes not staged for commit:": "Unstaged",
  "Untracked files:": "Untracked",
  "Unmerged paths:": "Conflicts",
} as const;

export function gitStatus(raw: string) {
  const [heading, ...lines] = plainOutput(raw).trimEnd().split(/\r?\n/);
  const branch =
    /^On branch (.+)$/.exec(heading)?.[1] ??
    (/^HEAD detached (?:at|from) .+$/.test(heading) ? heading : undefined);
  if (!branch) return null;

  const groups = Object.values(statusSections).map((label) => ({
    label,
    files: [] as { path: string; change?: string }[],
  }));
  let group: (typeof groups)[number] | undefined;
  let clean = false;
  for (const line of lines) {
    if (Object.hasOwn(statusSections, line)) {
      group = groups.find(
        ({ label }) =>
          label === statusSections[line as keyof typeof statusSections],
      );
    } else if (group && line.startsWith("\t")) {
      const entry = line.slice(1);
      if (group.label === "Untracked") {
        group.files.push({ path: entry });
      } else {
        const change = /^([^:]+): +(.+)$/.exec(entry);
        if (!change) return null;
        group.files.push({ path: change[2], change: change[1] });
      }
    } else if (/^nothing to commit(?:, working tree clean)?$/.test(line)) {
      clean = true;
    } else if (
      line &&
      !/^  \(|^(?:Your branch |You have |All conflicts |No commits yet$|no changes added |nothing added |nothing to commit, )/.test(
        line,
      )
    ) {
      return null;
    }
  }
  return clean || groups.some(({ files }) => files.length)
    ? { branch, groups }
    : null;
}

export function gitCommits(raw: string) {
  const output = plainOutput(raw).trimEnd();
  if (!output || /[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]/.test(output)) return null;
  const commits = [];
  for (const block of output.split(/\r?\n(?=commit )/)) {
    const match =
      /^commit ([a-f0-9]{7,64})(?: \(([^\r\n]+)\))?\r?\n(?:Merge: [a-f0-9 ]+\r?\n)?Author: ([^\r\n]+)\r?\nDate: +([^\r\n]+)(?:\r?\n\r?\n([\s\S]*))?$/.exec(
        block.trimEnd(),
      );
    if (!match) return null;
    const [, hash, refs, author, date, body = ""] = match;
    const message = body.replace(/^ {4}/gm, "");
    commits.push({ hash, refs, author, date, message });
  }
  return commits;
}
