import assert from "node:assert/strict";
import test from "node:test";
import { propagateChildExit } from "./child-exit.mjs";

function runtime() {
  const calls = [];
  return {
    calls,
    pid: 123,
    exit(code) {
      calls.push(["exit", code]);
    },
    kill(pid, signal) {
      calls.push(["kill", pid, signal]);
    },
    removeAllListeners(signal) {
      calls.push(["removeAllListeners", signal]);
    },
  };
}

test("propagates a normal child exit code", () => {
  const fake = runtime();
  propagateChildExit(7, null, fake);
  assert.deepEqual(fake.calls, [["exit", 7]]);
});

test("uses a failure exit when the child provides no status", () => {
  const fake = runtime();
  propagateChildExit(null, null, fake);
  assert.deepEqual(fake.calls, [["exit", 1]]);
});

test("re-emits a child termination signal", () => {
  const fake = runtime();
  propagateChildExit(null, "SIGTERM", fake);
  assert.deepEqual(fake.calls, [
    ["removeAllListeners", "SIGTERM"],
    ["kill", 123, "SIGTERM"],
  ]);
});
