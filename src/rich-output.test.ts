import assert from "node:assert/strict";
import test from "node:test";
import {
  diskRows,
  gitStatus,
  gitCommits,
  isGitLogCommand,
  isLogCommand,
  logLines,
  dockerComposeRows,
  dockerImageRows,
  dockerRows,
  richCapture,
  type RichResult,
} from "./rich-output.ts";

const header =
  "CONTAINER ID   IMAGE     COMMAND     CREATED    STATUS                      PORTS     NAMES";
const row =
  '123456789abc   nginx     "nginx"     2 days     Up 2 days (healthy)         80/tcp    web';

test("Docker table preserves fields, including health and uptime", () => {
  assert.deepEqual(dockerRows(header + "\r\n" + row + "\r\n"), [
    {
      id: "123456789abc",
      image: "nginx",
      name: "web",
      status: "Up 2 days (healthy)",
      health: "healthy",
      uptime: "2 days",
      ports: "80/tcp",
    },
  ]);
  assert.deepEqual(dockerRows(header + "\r\n"), []);
  assert.equal(dockerRows(header + "\r\nunknown format"), null);
  assert.equal(dockerRows('{"Names":"web"}'), null);
});

test("capture frames span chunks and preserve UTF-8, raw output and exit status", () => {
  const results: RichResult[] = [];
  const capture = richCapture((result) => results.push(result));
  const bytes = new TextEncoder().encode(
    "prompt\x1b]6973;docker ps -a\x07Docker ไม่พร้อม\r\n\x1b]6973;exit=127\x07prompt",
  );
  for (const byte of bytes) capture.push(Uint8Array.of(byte));
  assert.equal(results.length, 2);
  assert.deepEqual(results[1], {
    command: "docker ps -a",
    raw: "Docker ไม่พร้อม\r\n",
    code: 127,
    truncated: false,
  });
});

test("oversized or interrupted captures fall back to terminal scrollback", () => {
  const results: RichResult[] = [];
  const capture = richCapture((result) => results.push(result));
  capture.push(
    new TextEncoder().encode("\x1b]6973;docker ps\x07" + "x".repeat(600_000)),
  );
  capture.finish();
  assert.equal(results[1].code, null);
  assert.equal(results[1].truncated, true);
  assert.equal(results[1].raw.length, 512 * 1024);
});

test("zsh prompt redraw stays out of Docker results and raw copy", () => {
  const results: RichResult[] = [];
  const capture = richCapture((result) => results.push(result));
  const raw = header + "\r\n" + row + "\r\n";
  capture.push(
    new TextEncoder().encode(
      "\x1b]6973;docker ps\x07" +
        raw +
        "\x1b[1m\x1b[7m%\x1b[27m\x1b[1m\x1b[0m" +
        " ".repeat(79) +
        "\r \r" +
        "\x1b]6973;exit=0\x07",
    ),
  );
  assert.equal(results[1].raw, raw);
  assert.equal(dockerRows(results[1].raw)?.[0].name, "web");
});

test("image tables support classic columns and the newer TTY legend", () => {
  assert.deepEqual(
    dockerImageRows(
      "REPOSITORY   TAG     IMAGE ID       CREATED      SIZE\n" +
        "postgres     15      123456789abc   2 days ago   451MB",
    ),
    [{ name: "postgres", tag: "15", id: "123456789abc", size: "451MB" }],
  );
  assert.deepEqual(
    dockerImageRows(
      "                  Info ->  U In Use\r\n" +
        "IMAGE   ID   DISK USAGE   CONTENT SIZE   EXTRA\r\n" +
        "localhost:5000/web:dev   123456789abc   20MB   0B   U\r\n",
    ),
    [
      {
        name: "localhost:5000/web",
        tag: "dev",
        id: "123456789abc",
        size: "20MB",
        contentSize: "0B",
        extra: "U",
      },
    ],
  );
  assert.equal(dockerImageRows("IMAGE\npostgres:15"), null);
});

test("Compose tables retain service, status and optional ports", () => {
  const header =
    "NAME    IMAGE     COMMAND    SERVICE   CREATED    STATUS      PORTS";
  assert.deepEqual(dockerComposeRows(header), []);
  assert.deepEqual(
    dockerComposeRows(
      header +
        '\nweb-1   nginx     "nginx"    web       2 days     Up 2 days   80/tcp',
    ),
    [
      {
        name: "web-1",
        image: "nginx",
        service: "web",
        status: "Up 2 days",
        ports: "80/tcp",
      },
    ],
  );
  assert.equal(dockerComposeRows("warning\n" + header), null);
});

test("colorized Docker images with a wrapped legend still render as a table", () => {
  const raw =
    "     \x1b[1m\x1b[106m\x1b[30mi\x1b[0m\r\n" +
    "\x1b[96mInfo → \x1b[0m \x1b[38;5;0m\x1b[48;5;14m U \x1b[0m In Use\r\n" +
    "\x1b[39m\x1b[1mIMAGE\x1b[0m   ID   DISK USAGE   CONTENT SIZE   EXTRA\r\n" +
    "\x1b[34m\x1b[1mpostgres:15\x1b[0m   \x1b[39m123456789abc\x1b[0m   451MB   0B   U\r\n";
  assert.equal(dockerImageRows(raw)?.[0].name, "postgres");
});

test("df reads macOS inode columns and GNU mount paths with spaces", () => {
  const mac =
    "Filesystem Size Used Avail Capacity iused ifree %iused Mounted on\n";
  const linux = "Filesystem 1K-blocks Used Available Use% Mounted on\n";
  assert.deepEqual(
    diskRows(mac + "devfs 198Ki 198Ki 0Bi 100% 686 0 100% /dev"),
    [
      {
        name: "devfs",
        size: "198Ki",
        used: "198Ki",
        available: "0Bi",
        usage: "100%",
        mount: "/dev",
      },
    ],
  );
  assert.equal(
    diskRows(linux + "/dev/sda1 100 30 70 30% /media/My Disk")?.[0].mount,
    "/media/My Disk",
  );
  assert.equal(diskRows(linux + "unexpected format"), null);
});

test("only supported one-shot Docker log commands get a log view", () => {
  for (const command of [
    "docker logs postgres_db",
    "docker logs --tail 100 --timestamps postgres_db",
  ]) {
    assert.equal(isLogCommand(command), true);
    const results: RichResult[] = [];
    richCapture((result) => results.push(result)).push(
      new TextEncoder().encode(
        `\x1b]6973;${command}\x07ready\r\n\x1b]6973;exit=0\x07`,
      ),
    );
    assert.equal(results[1]?.raw, "ready\r\n");
  }
  for (const command of [
    "docker logs -f postgres_db",
    "docker logs web | cat",
    "docker logs web > file",
    "docker logs web; pwd",
  ]) {
    assert.equal(isLogCommand(command), false);
  }
});

test("log lines preserve messages while separating timestamps and severity", () => {
  assert.deepEqual(
    logLines(
      "2026-11-10T12:00:00.123456789Z \x1b[31mERROR\x1b[0m unavailable\r\nWARN retrying\n",
    ),
    [
      {
        index: 0,
        timestamp: "2026-11-10T12:00:00.123456789Z",
        message: "ERROR unavailable",
        level: "error",
      },
      {
        index: 1,
        timestamp: undefined,
        message: "WARN retrying",
        level: "warning",
      },
    ],
  );
  assert.deepEqual(logLines(""), []);
});

test("Git status groups staged, unstaged and untracked paths", () => {
  const result = gitStatus(
    "On branch main\n\nChanges to be committed:\n\tnew file:   a.ts\n\n" +
      "Changes not staged for commit:\n\tmodified:   a.ts\n\nUntracked files:\n\tMy file.ts\n",
  );
  assert.equal(result?.branch, "main");
  assert.deepEqual(
    result?.groups.map(({ files }) => files.map(({ path }) => path)),
    [["a.ts"], ["a.ts"], ["My file.ts"], []],
  );
  assert.ok(
    gitStatus("HEAD detached at abc123\nnothing to commit, working tree clean"),
  );
  assert.equal(gitStatus("## main\n?? file"), null);
});

test("Git history reads decorated and merge commits without mistaking message text for a header", () => {
  const first =
    "commit 123456789abc (HEAD -> main)\r\nMerge: 1234567 abcdef0\r\nAuthor: Dev <dev@example.test>\r\nDate:   Tue Nov 10 20:00:00 2026 +0700\r\n\r\n    Merge branch\r\n\r\n    commit remains message text";
  const second =
    "commit abcdef012345\nAuthor: Dev <dev@example.test>\nDate:   Mon Nov 9 20:00:00 2026 +0700\n\n    Initial commit";
  const commits = gitCommits(first + "\r\n\r\n" + second);
  assert.equal(commits?.length, 2);
  assert.equal(commits?.[0].refs, "HEAD -> main");
  assert.match(commits?.[0].message ?? "", /commit remains message text/);
  assert.equal(gitCommits("\x1b[?1049h" + first), null);
  assert.equal(isGitLogCommand("git --no-pager log -n 20"), true);
  assert.equal(isGitLogCommand("git log | cat"), false);
});
