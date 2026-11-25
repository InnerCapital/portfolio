import { test } from "node:test";
import assert from "node:assert/strict";

process.env.ALLOWED_DOMAIN = "acmehire.example";
const { emailAllowed, isKeyholder, keyholders, isRestricted } = await import("../lib/access.ts");

test("every Acme Hire account can open the vault", () => {
  for (const e of ["coordinator@acmehire.example", "ops@acmehire.example", "director@acmehire.example"]) assert.equal(emailAllowed(e), true, e);
  for (const e of ["someone@gmail.com", "x@acmehire.example.evil.com", "", null]) assert.equal(emailAllowed(e as string), false, String(e));
});

test("only hello@, director@ and opsmanager@ are keyholders", () => {
  delete process.env.VAULT_KEYHOLDERS;
  assert.deepEqual(keyholders(), ["hello@acmehire.example", "director@acmehire.example", "opsmanager@acmehire.example"]);
  for (const e of ["hello@acmehire.example", "director@acmehire.example", "opsmanager@acmehire.example"]) assert.equal(isKeyholder(e), true, e);
  for (const e of ["coordinator@acmehire.example", "opsmanager@acmecapital.example", null]) assert.equal(isKeyholder(e as string), false, String(e));
});

test("VAULT_KEYHOLDERS overrides the list but never outside the domain", () => {
  process.env.VAULT_KEYHOLDERS = "coordinator@acmehire.example, someone@gmail.com";
  assert.equal(isKeyholder("coordinator@acmehire.example"), true);
  assert.equal(isKeyholder("hello@acmehire.example"), false);
  assert.equal(isKeyholder("someone@gmail.com"), false);
  delete process.env.VAULT_KEYHOLDERS;
});

test("API key method or the flag makes an entry restricted", () => {
  assert.equal(isRestricted({ restricted: false, login_method: "API key" }), true);
  assert.equal(isRestricted({ restricted: true, login_method: "Password" }), true);
  assert.equal(isRestricted({ restricted: false, login_method: "Password" }), false);
  assert.equal(isRestricted({ login_method: "Google SSO" }), false);
});

test("restricted entries can be shared with named staff", async () => {
  const { canReveal, invalidSharedWith } = await import("../lib/access.ts");
  const revolut = { restricted: true, login_method: "Shared login", shared_with: "coordinator@acmehire.example" };
  assert.equal(canReveal(revolut, { email: "coordinator@acmehire.example", keyholder: false }), true);
  assert.equal(canReveal(revolut, { email: "director@acmehire.example", keyholder: true }), true);
  assert.equal(canReveal(revolut, { email: "driver@acmehire.example", keyholder: false }), false);
  assert.equal(canReveal({ restricted: false, login_method: "Password", shared_with: "" }, { email: "driver@acmehire.example", keyholder: false }), true);
  assert.equal(invalidSharedWith("coordinator@acmehire.example, director@acmehire.example"), null);
  assert.equal(invalidSharedWith("coordinator@acmehire.example, x@gmail.com"), "x@gmail.com");
});

test("logo lookup picks the right hosts and icon", async () => {
  const { hostFrom, rootDomain, candidateHosts, iconFromHtml } = await import("../lib/logo.ts");
  assert.equal(hostFrom("business.revolut.com/signin"), "business.revolut.com");
  assert.equal(hostFrom("http://127.0.0.1/x"), "");
  assert.equal(hostFrom("localhost"), "");
  assert.equal(rootDomain("admin.example-dns.co.uk"), "example-dns.co.uk");
  assert.deepEqual(candidateHosts("app.attio.com"), ["app.attio.com", "attio.com", "www.attio.com"]);
  const html = `<link rel="icon" href="/f.ico"><link rel="apple-touch-icon" sizes="180x180" href="/apple.png">`;
  assert.equal(iconFromHtml(html, "https://attio.com/"), "https://attio.com/apple.png");
});
