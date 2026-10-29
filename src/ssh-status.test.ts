import test from "node:test";
import assert from "node:assert/strict";
import { sshFailure } from "./ssh-status.ts";

test("only failed SSH exits produce a failure panel", () => {
  assert.equal(sshFailure("dev@host: Permission denied (publickey).", 0), null);
  assert.equal(sshFailure("command failed", 1), null);
  assert.equal(sshFailure("", null), null);
});
test("diagnoses SSH errors and strips terminal controls", () => {
  assert.equal(
    sshFailure(
      "\x1b[31mssh: connect to host localhost port 1: Connection refused\x1b[0m\r\n",
      255,
    )?.title,
    "Connection refused",
  );
  assert.equal(
    sshFailure("ssh: connect to host host port 22: Operation timed out", 255)
      ?.title,
    "Connection timed out",
  );
  assert.equal(
    sshFailure("Host key verification failed.\r\n", 255)?.title,
    "Host key verification failed",
  );
  assert.equal(
    sshFailure("dev@host: Permission denied (publickey,password).", 255)?.title,
    "Authentication failed",
  );
  assert.equal(
    sshFailure(
      "ssh: Could not resolve hostname missing: nodename nor servname provided",
      255,
    )?.title,
    "Server not found",
  );
});
test("details exclude interactive answers, OTP, shell commands and banners", () => {
  const result = sshFailure(
    "Password: fake-password\r\n123456\r\necho secret\r\nWelcome!\r\ndev@host: Permission denied (publickey,password).\r\n",
    255,
  )!;
  assert.equal(
    result.details,
    "dev@host: Permission denied (publickey,password).",
  );
  assert.equal(
    sshFailure("unrecognized server output", 255)?.details,
    "OpenSSH exited with code 255. See the terminal for more details.",
  );
});

test("banner exchange timeouts retain their OpenSSH diagnostic", () => {
  const failure = sshFailure(
    "Connection timed out during banner exchange\r\nConnection to 127.0.0.1 port 49992 timed out\r\n",
    255,
  )!;
  assert.equal(failure.title, "Connection timed out");
  assert.match(failure.details, /banner exchange/);
});

test("SSH groups preserve connections, handle legacy profiles, and keep Ungrouped separate", async () => {
  const { groupSshProfiles, newSshProfile } = await import("./ssh-model.ts");
  const profiles = [
    { ...newSshProfile(), id: "one", name: "API", group: " Production " },
    { ...newSshProfile(), id: "two", name: "Local", group: undefined },
    { ...newSshProfile(), id: "three", name: "Worker", group: "Production" },
    { ...newSshProfile(), id: "four", name: "Dev", group: "Development" },
    { ...newSshProfile(), id: "five", name: "Named group", group: "Ungrouped" },
  ];
  const groups = groupSshProfiles(profiles);
  assert.deepEqual(
    groups.map((group) => group.name),
    ["Development", "Production", "Ungrouped", ""],
  );
  assert.deepEqual(
    groups[1].profiles.map((profile) => profile.id),
    ["one", "three"],
  );
  assert.equal(groups[3].profiles[0].id, "two");
  assert.equal(profiles[0].group, " Production ");
  assert.deepEqual(groupSshProfiles([]), []);
});

test("custom SSH group order persists independently of connection order and new groups", async () => {
  const { groupSshProfiles, newSshProfile } = await import("./ssh-model.ts");
  const a = { ...newSshProfile(), id: "a", group: "Development" };
  const b = { ...newSshProfile(), id: "b", group: "Production" };
  const c = { ...newSshProfile(), id: "c", group: "Production" };
  const d = { ...newSshProfile(), id: "d", group: "New group" };
  const saved = JSON.parse(JSON.stringify(["Production", "Development"]));
  const groups = groupSshProfiles([c, a, b, d], saved);
  assert.deepEqual(
    groups.map((g) => g.name),
    ["Production", "Development", "New group"],
  );
  assert.deepEqual(groups[0].profiles, [c, b]);
  assert.deepEqual(
    groupSshProfiles([a, b], ["Deleted group", "Production"]).map(
      (g) => g.name,
    ),
    ["Production", "Development"],
  );
});
