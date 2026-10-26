import test from "node:test";
import assert from "node:assert/strict";
import {
  appendHistory,
  bytes,
  percent,
  processRows,
  uptime,
  type SystemSnapshot,
} from "./utop-model.ts";
const snapshot: SystemSnapshot = {
  sampledAt: 1000,
  host: "local",
  os: "macOS",
  cpuName: "CPU",
  cpuPercent: null,
  cores: [],
  totalMemory: 1000,
  usedMemory: 500,
  totalSwap: 0,
  usedSwap: 0,
  uptime: 90000,
  load: [0, 0, 0],
  processes: [],
  networks: [
    {
      name: "en0",
      received: null,
      transmitted: null,
      totalReceived: 10,
      totalTransmitted: 20,
    },
  ],
  disks: [],
};
test("history keeps actual timestamps, unknown warm-up rates, and bounded 2-minute samples", () => {
  let history = appendHistory([], snapshot);
  assert.equal(history[0].cpu, null);
  assert.equal(history[0].networks.en0.down, null);
  assert.equal(appendHistory(history, snapshot), history);
  for (let i = 2; i <= 200; i++)
    history = appendHistory(history, {
      ...snapshot,
      sampledAt: i * 1000,
      cpuPercent: 10,
    });
  assert.equal(history.length, 121);
  assert.equal(history[0].time, 80000);
  assert.equal(history.at(-1)?.time, 200000);
});
test("process search and sorting retain exact IDs, per-core CPU, and null samples", () => {
  const processes = [
    { pid: 1, name: "Chrome", cpu: 220, memory: 100, status: "Run" },
    { pid: 2, name: "Finder", cpu: null, memory: 300, status: "Sleep" },
  ];
  assert.equal(processRows(processes, "", "cpu", false)[0].pid, 1);
  assert.equal(processRows(processes, "", "memory", false)[0].pid, 2);
  assert.equal(processRows(processes, "finder", "pid", true)[0].pid, 2);
  assert.equal(processRows(processes, "2", "pid", true).length, 1);
  assert.equal(processRows(processes, "missing", "pid", true).length, 0);
  assert.equal(processes[0].pid, 1);
});
test("memory, byte units and uptime handle empty swap and missing first network rates", () => {
  assert.equal(percent(1, 0), 0);
  assert.equal(percent(120, 100), 100);
  assert.equal(percent(-10, 100), 0);
  assert.equal(bytes(null), "—");
  assert.equal(bytes(1024), "1.0 KiB");
  assert.equal(bytes(0), "0 B");
  assert.equal(uptime(90000), "1d 1h 0m");
});
