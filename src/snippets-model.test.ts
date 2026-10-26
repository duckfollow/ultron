import test from "node:test";
import assert from "node:assert/strict";
import {
  loadSnippets,
  saveSnippets,
  prepareSnippet,
  SNIPPETS_KEY,
} from "./snippets-model.ts";

test("snippets preserve exact commands across save, reload, update and deletion", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  assert.deepEqual(loadSnippets(storage), []);
  const snippet = {
    id: "one",
    name: "สถานะ",
    command: "git status --short\nprintf '🦆'",
    updatedAt: 1000,
  };
  saveSnippets(storage, [snippet]);
  assert.deepEqual(loadSnippets(storage), [snippet]);
  saveSnippets(storage, [{ ...snippet, command: "git diff" }]);
  assert.equal(loadSnippets(storage)[0].command, "git diff");
  saveSnippets(storage, []);
  assert.deepEqual(loadSnippets(storage), []);
  assert.equal(values.get(SNIPPETS_KEY), "[]");
});
test("invalid stored data and failed writes surface errors without replacing storage", () => {
  for (const value of ["{", "null", "{}", '[{"id":"x"}]'])
    assert.throws(() => loadSnippets({ getItem: () => value }));
  const snippet = { id: "one", name: "name", command: "pwd", updatedAt: 1000 };
  assert.throws(() =>
    loadSnippets({ getItem: () => JSON.stringify([snippet, snippet]) }),
  );
  assert.throws(() =>
    saveSnippets(
      {
        setItem: () => {
          throw Error("full");
        },
      },
      [snippet],
    ),
  );
});
test("insertion never adds Enter and removes trailing newline from copied commands", () => {
  assert.equal(prepareSnippet("git status\r\n", false), "git status");
  assert.equal(prepareSnippet("  echo 'hello'  ", false), "  echo 'hello'  ");
  assert.equal(
    prepareSnippet("echo one\r\necho two\n", true),
    "echo one\necho two",
  );
  assert.throws(
    () => prepareSnippet("echo one\necho two", false),
    /bracketed paste/,
  );
  assert.throws(() => prepareSnippet("echo\tone", false), /bracketed paste/);
});
test("rejects control sequences that could escape paste mode or submit terminal input", () => {
  for (const command of [
    "\x1b[201~whoami",
    "echo ok\x03",
    "echo\x00",
    "\x85",
    "\n",
    "x".repeat(65537),
  ]) {
    assert.throws(() => prepareSnippet(command, true));
  }
  assert.equal(
    prepareSnippet("printf 'ลูกค้า 🦆'", true),
    "printf 'ลูกค้า 🦆'",
  );
});
