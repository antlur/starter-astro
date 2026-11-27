import assert from "node:assert/strict";
import { test } from "node:test";
import { redirectPathKey, renderBackstageRedirects } from "../src/lib/backstage/redirects";

const options = {
  accountId: "a",
  siteUrl: "https://example.test/",
  existingPaths: new Set(["/menu", "/menu.pdf"]),
};
const row = {
  account_id: "a",
  source_url: "/dinner.pdf",
  target_url: "/menu/?type=dinner#entrees",
  status_code: 301,
};

test("renders exact, relative, external and URL-encoded migration rules", () => {
  assert.equal(renderBackstageRedirects([
    row,
    { ...row, source_url: "/old%20press", target_url: "https://news.example.test/story", status_code: 302 },
  ], options), "/dinner.pdf /menu/?type=dinner#entrees 301\n/old%20press https://news.example.test/story 302\n");
  assert.equal(redirectPathKey("/%6fLd/"), "/oLd");
  assert.equal(renderBackstageRedirects([], options), "");
});

test("rejects rule injection, unsupported syntax and foreign tenant data", () => {
  for (const source of [
    "/", "/api/lookup", "/_headers", "/_redirects", "/_astro/new.js", "/blog/*", "/:slug", "/old?x=1",
    "/old#top", "//elsewhere.test", "/a//b", "/../old", "/%2E%2E/old", "/old%2Fnext",
    "/old%252Fnext", "/old%0d%0a", "/old%ZZ", "/old\n/another", "/old\\anything",
  ]) {
    assert.throws(() => renderBackstageRedirects([{ ...row, source_url: source }], options), /Backstage redirect 1/);
  }
  for (const target of [
    "javascript:alert(1)", "//elsewhere.test", "/\\outside.test/", "https://name:secret@elsewhere.test",
    "https://elsewhere.test/?q=1\n/forced", "https://elsewhere.test/\n", "/%0aarrived", "/new/:splat",
  ]) {
    assert.throws(() => renderBackstageRedirects([{ ...row, target_url: target }], options), /Backstage redirect 1/);
  }
  assert.throws(() => renderBackstageRedirects([{ ...row, account_id: "b" }], options), /different account/);
  assert.throws(() => renderBackstageRedirects([{ ...row, status_code: 200 }], options), /301 and 302/);
  assert.throws(() => renderBackstageRedirects(null, options), /redirect list/);
});

test("rejects built path collisions, duplicates, loops and chains", () => {
  for (const source of ["/menu/", "/menu%2Epdf"]) {
    assert.throws(() => renderBackstageRedirects([{ ...row, source_url: source }], options), /built page or asset/);
  }
  assert.throws(() => renderBackstageRedirects([row, { ...row, source_url: "/dinner.pdf/" }], options), /Duplicate/);
  assert.throws(() => renderBackstageRedirects([{ ...row, target_url: "/dinner.pdf?old=1" }], options), /final URL/);
  assert.throws(() => renderBackstageRedirects([
    { ...row, source_url: "/menu-2023", target_url: "https://www.example.test/dinner.pdf" }, row,
  ], options), /final URL/);
});
