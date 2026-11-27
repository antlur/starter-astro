import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { test, type TestContext } from "node:test";
import { publishBackstageRedirects } from "../src/site/publish-redirects";

const env = {
  BACKSTAGE_SOURCE: "api",
  BACKSTAGE_API_KEY: "local-test-token",
  BACKSTAGE_ACCOUNT_ID: "test-account",
  BACKSTAGE_API_URL: "https://api.example.test/api",
  SITE_URL: "https://restaurant.example.test",
};

const record = {
  id: "rule",
  account_id: env.BACKSTAGE_ACCOUNT_ID,
  source_url: "/old-menu",
  target_url: "/menus/",
  status_code: 301,
};

const run = async (directory: string, settings = env) => {
  const hook = publishBackstageRedirects(settings).hooks["astro:build:done"]!;
  await hook({
    dir: pathToFileURL(directory + sep),
    pages: [],
    assets: new Map(),
    logger: { info() {} } as unknown as Parameters<typeof hook>[0]["logger"],
  });
};

const output = async (t: TestContext) => {
  const directory = await mkdtemp(join(tmpdir(), "starter-redirects-"));
  t.after(() => rm(directory, { force: true, recursive: true }));
  return directory;
};

test("publishes only this account's rules after existing site-owned rules", async (t) => {
  const directory = await output(t);
  const file = join(directory, "_redirects");
  await writeFile(file, "/manual / 302");
  const request = t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL, options?: RequestInit) => {
    assert.equal(String(url), "https://api.example.test/api/redirects");
    const headers = new Headers(options?.headers);
    assert.equal(headers.get("X-Account-Id"), env.BACKSTAGE_ACCOUNT_ID);
    assert.equal(headers.get("Authorization"), "Bearer local-test-token");
    return Response.json({ data: [record] });
  });

  await run(directory);

  assert.equal(request.mock.callCount(), 1);
  assert.equal(await readFile(file, "utf8"), "/manual / 302\n/old-menu /menus/ 301\n");
});

test("keeps fixture builds offline for redirects", async (t) => {
  const directory = await output(t);
  const file = join(directory, "_redirects");
  await writeFile(file, "/manual / 302\n");
  const request = t.mock.method(globalThis, "fetch", async () => assert.fail("redirects must not be fetched"));

  await run(directory, { ...env, BACKSTAGE_SOURCE: "fixture" });

  assert.equal(request.mock.callCount(), 0);
  assert.equal(await readFile(file, "utf8"), "/manual / 302\n");
});

test("leaves site-owned redirects alone when Backstage has no rules, even without SITE_URL", async (t) => {
  const directory = await output(t);
  const file = join(directory, "_redirects");
  const request = t.mock.method(globalThis, "fetch", async () => Response.json({ data: [] }));

  await run(directory, { ...env, SITE_URL: "" });
  await assert.rejects(readFile(file), { code: "ENOENT" });
  await writeFile(file, "/manual / 302");
  await run(directory, { ...env, SITE_URL: "" });

  assert.equal(request.mock.callCount(), 2);
  assert.equal(await readFile(file, "utf8"), "/manual / 302");
});

test("requires SITE_URL when Backstage has saved rules", async (t) => {
  const directory = await output(t);
  t.mock.method(globalThis, "fetch", async () => Response.json({ data: [record] }));

  await assert.rejects(run(directory, { ...env, SITE_URL: "" }), /Set SITE_URL/);
  await assert.rejects(readFile(join(directory, "_redirects")), { code: "ENOENT" });
});

test("does not emit redirects that would mask a built page or static asset", async (t) => {
  const directory = await output(t);
  await mkdir(join(directory, "menus"));
  await writeFile(join(directory, "menus", "index.html"), "<h1>Menus</h1>");
  await writeFile(join(directory, "brochure.pdf"), "asset");
  for (const source of ["/menus", "/menus/index", "/brochure.pdf"]) {
    const request = t.mock.method(globalThis, "fetch", async () =>
      Response.json({ data: [{ ...record, source_url: source, target_url: "/" }] }));
    await assert.rejects(run(directory), /existing|built|collision/i);
    request.mock.restore();
  }
  await assert.rejects(readFile(join(directory, "_redirects")), { code: "ENOENT" });
});
