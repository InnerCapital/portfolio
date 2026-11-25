import test from "node:test";
import assert from "node:assert";
import { base32Encode, base32Decode, codeAt, verifyCode, newRecoveryCodes, hashRecoveryCode, otpauthUrl } from "../lib/totp.ts";
import { signMfa, mfaValid } from "../lib/mfaCookie.ts";

// RFC 6238 Appendix B, SHA-1 secret "12345678901234567890". 6-digit = last 6 of the 8-digit values.
const SECRET = base32Encode(Buffer.from("12345678901234567890"));
const VECTORS: [number, string][] = [[59, "287082"], [1111111109, "081804"], [1111111111, "050471"], [1234567890, "005924"], [2000000000, "279037"], [20000000000, "353130"]];

test("base32 round trip", () => {
  assert.equal(base32Decode(SECRET).toString(), "12345678901234567890");
  assert.equal(SECRET, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
});

test("RFC 6238 test vectors", () => {
  for (const [t, code] of VECTORS) assert.equal(codeAt(SECRET, Math.floor(t / 30)), code, `t=${t}`);
});

test("accepts current and adjacent windows, rejects others", () => {
  const now = 1_700_000_000_000; const step = Math.floor(now / 30000);
  assert.equal(verifyCode(SECRET, codeAt(SECRET, step), null, now), step);
  assert.equal(verifyCode(SECRET, codeAt(SECRET, step - 1), null, now), step - 1);
  assert.equal(verifyCode(SECRET, codeAt(SECRET, step + 1), null, now), step + 1);
  assert.equal(verifyCode(SECRET, codeAt(SECRET, step - 2), null, now), null);
  assert.equal(verifyCode(SECRET, "12345", null, now), null);
  assert.equal(verifyCode(SECRET, "abcdef", null, now), null);
});

test("refuses replay of a used window", () => {
  const now = 1_700_000_000_000; const step = Math.floor(now / 30000);
  assert.equal(verifyCode(SECRET, codeAt(SECRET, step), step, now), null);
  assert.equal(verifyCode(SECRET, codeAt(SECRET, step + 1), step, now), step + 1);
});

test("recovery codes are unique, hashed case/dash-insensitively", () => {
  const codes = newRecoveryCodes();
  assert.equal(new Set(codes).size, 10);
  for (const c of codes) assert.match(c, /^[a-z2-9]{5}-[a-z2-9]{5}$/);
  assert.equal(hashRecoveryCode(codes[0]), hashRecoveryCode(codes[0].toUpperCase().replace("-", " ")));
});

test("otpauth URL is well formed", () => {
  const u = new URL(otpauthUrl(SECRET, "a@acmehire.example"));
  assert.equal(u.protocol, "otpauth:");
  assert.equal(u.searchParams.get("secret"), SECRET);
  assert.equal(u.searchParams.get("issuer"), "AH Vault");
});

test("2FA cookie: valid only for the same email, untampered, unexpired", async () => {
  process.env.AUTH_SECRET = "x".repeat(40);
  const t = await signMfa("A@acmehire.example");
  assert.equal(await mfaValid(t, "a@acmehire.example"), true);
  assert.equal(await mfaValid(t, "b@acmehire.example"), false);
  const [p, s] = t.split(".");
  assert.equal(await mfaValid(`${p}x.${s}`, "a@acmehire.example"), false);
  assert.equal(await mfaValid(`${p}.${s.slice(0, -2)}AA`, "a@acmehire.example"), false);
  assert.equal(await mfaValid(undefined, "a@acmehire.example"), false);
  process.env.AUTH_SECRET = "y".repeat(40);
  assert.equal(await mfaValid(t, "a@acmehire.example"), false, "different secret rejects");
});
