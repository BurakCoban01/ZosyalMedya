import assert from "node:assert/strict";
import test from "node:test";
import { buildTarget } from "../src/index.ts";

test("network-path input cannot replace the configured origin", () => {
  const origin = new URL("https://hidden-origin.example/");
  const incoming = new URL("https://public.example//attacker.example/private?token=path-value");

  const target = buildTarget(incoming, origin);

  assert.equal(target.origin, origin.origin);
  assert.equal(target.pathname, "//attacker.example/private");
  assert.equal(target.search, "?token=path-value");
});
