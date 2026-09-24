// node --test lib/formato.test.mjs (Node 22.18+ importa .ts directo)
import assert from "node:assert/strict";
import { test } from "node:test";
import { moneda } from "./formato.ts";

const limpio = (t) => t.replace(/\s/g, " ");

test("moneda: pesos cerrados sin decimales, centavos cuando los hay", () => {
  assert.equal(limpio(moneda(500)), "$500");
  assert.equal(limpio(moneda("500.00")), "$500");
  assert.equal(limpio(moneda("499.50")), "$499.50");
  assert.equal(limpio(moneda(37.5)), "$37.50");
  assert.equal(limpio(moneda("1250.05")), "$1,250.05");
  assert.equal(moneda(null), "—");
});
