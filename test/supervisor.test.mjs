import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { atomicWriteJson } from "../dashboard/supervisor.mjs";

test("supervisor atomic json writes use unique temp files under concurrency", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-supervisor-"));
  const target = path.join(root, "state.json");

  await Promise.all(
    Array.from({ length: 40 }, (_, index) =>
      atomicWriteJson(target, { index, values: [index, index + 1] })
    )
  );

  const raw = await fs.readFile(target, "utf8");
  const parsed = JSON.parse(raw);
  assert.equal(typeof parsed.index, "number");
  assert.equal(parsed.values.length, 2);

  const leftovers = (await fs.readdir(root)).filter((name) => name.endsWith(".tmp"));
  assert.deepEqual(leftovers, []);
});
