// node --test lib/estadistica.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { probabilidadMejor } from "./estadistica.ts";

test("sin datos no hay probabilidad", () => {
  assert.equal(probabilidadMejor(undefined, { asignados: 10, contestaron: 5 }), null);
});
test("iguales dan 50 %", () => {
  assert.ok(Math.abs(probabilidadMejor({ asignados: 200, contestaron: 60 }, { asignados: 200, contestaron: 60 }) - 0.5) < 0.01);
});
test("B claramente mejor supera 95 %", () => {
  assert.ok(probabilidadMejor({ asignados: 300, contestaron: 60 }, { asignados: 300, contestaron: 100 }) > 0.99);
});
test("B peor queda debajo de 5 %", () => {
  assert.ok(probabilidadMejor({ asignados: 300, contestaron: 100 }, { asignados: 300, contestaron: 60 }) < 0.01);
});
