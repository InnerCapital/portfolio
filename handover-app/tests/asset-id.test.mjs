// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { parseAssetId, unitTypeFromAssetId } from "../lib/assetId.ts";

test("reads the ID from the current plate URL", () => {
  assert.equal(parseAssetId("https://assets.acmehire.example/AHUKB260001"), "AHUKB260001");
});

test("reads older plate URLs and query form", () => {
  assert.equal(parseAssetId("https://acmehire.example/assets/ahukk250001"), "AHUKK250001");
  assert.equal(parseAssetId("https://asset-register-demo.netlify.app/?asset=AHUKD250001"), "AHUKD250001");
  assert.equal(parseAssetId("https://assets.acmehire.example/AHUKK260003/"), "AHUKK260003");
});

test("accepts a bare ID with stray spaces or lower case", () => {
  assert.equal(parseAssetId("  ahukk260005 "), "AHUKK260005");
});

test("rejects anything that is not an Acme Hire asset ID", () => {
  for (const bad of ["", "hello", "https://example.com/", "https://assets.acmehire.example/", "AHUKK25001", "WIFI:S:x;;"]) {
    assert.equal(parseAssetId(bad), null, bad);
  }
});

test("maps the type letter to the unit type", () => {
  assert.equal(unitTypeFromAssetId("AHUKB260002"), "Bar");
  assert.equal(unitTypeFromAssetId("AHUKD250001"), "Dark Kitchen");
  assert.equal(unitTypeFromAssetId("AHUKK250001"), "Street Kitchen");
  assert.equal(unitTypeFromAssetId("AHUKX250001"), "");
  assert.equal(unitTypeFromAssetId("nope"), "");
});
