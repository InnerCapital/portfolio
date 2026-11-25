// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { toInternationalPhone, maskPhone } from "../lib/phone.ts";

test("UK local and international forms become +44", () => {
  assert.equal(toInternationalPhone("07700 900123"), "+447700900123");
  assert.equal(toInternationalPhone("+44 7700 900123"), "+447700900123");
  assert.equal(toInternationalPhone("+44 (0)7700 900123"), "+447700900123");
  assert.equal(toInternationalPhone("0044 7700-900123"), "+447700900123");
  assert.equal(toInternationalPhone("447700900123"), "+447700900123");
  assert.equal(toInternationalPhone("020 7946 0958"), "+442079460958");
});

test("other countries pass through when given with +", () => {
  assert.equal(toInternationalPhone("+353 85 123 4567"), "+353851234567");
});

test("unreadable numbers are refused", () => {
  for (const bad of ["", null, undefined, "abc", "12345", "7700900123", "+0123456789", "+4412"]) {
    assert.equal(toInternationalPhone(bad), null, String(bad));
  }
});

test("masking keeps only the ends", () => {
  assert.equal(maskPhone("+447700900123"), "+44•••••••123");
});
