import assert from "node:assert/strict";
import test from "node:test";
import type { HeadlessPage } from "@antlur/backstage";
import { loadBlockManifests } from "../src/lib/backstage/block-manifests";
import { assertPageBlockDefinitions } from "../src/lib/backstage/content";
import { applyStarterSitePages, planStarterSitePages } from "../src/lib/backstage/site-initializer";

const website = { id: "site-1", app_name: "Sample Business" };

function page(input: Partial<HeadlessPage>): HeadlessPage {
  return {
    id: "page-1",
    title: "Home",
    slug: "/",
    pathname: "/",
    blocks: [],
    settings: {},
    is_home: true,
    layout: null,
    meta: { title: null, description: null },
    ...input,
  };
}

test("starter site plan creates generic Home and About pages without customer media or form data", () => {
  const plan = planStarterSitePages(website, [], []);

  assert.equal(plan.canApply, true);
  assert.deepEqual(plan.actions.map(({ title, path, status }) => ({ title, path, status })), [
    { title: "Home", path: "/", status: "create" },
    { title: "About", path: "/about", status: "create" },
  ]);
  assert.deepEqual(plan.actions[0].params?.blocks?.blocks.map(({ type }) => type), ["hero", "call-to-action"]);
  assert.deepEqual(plan.actions[1].params?.blocks?.blocks.map(({ type }) => type), ["hero", "rich-text"]);
  assert.equal(plan.actions[0].params?.blocks?.blocks[0].data.heading, "Welcome to Sample Business");
  assert.ok(plan.warnings.some((warning) => warning.includes("Contact page was not created")));
});

test("starter site plan adds a Contact page only when a form was explicitly selected", () => {
  const plan = planStarterSitePages(website, [], [], "form-1");
  const contact = plan.actions.find(({ path }) => path === "/contact");

  assert.equal(contact?.status, "create");
  assert.equal(contact?.params?.blocks?.blocks[0].type, "contact-form");
  assert.equal(contact?.params?.blocks?.blocks[0].data.form_id, "form-1");
});

test("restaurant opt-in plans only editable Home, About, and Contact with no media or canonical links", () => {
  const plan = planStarterSitePages(website, [], ["/menu/", "/locations/"], undefined, true);
  assert.equal(plan.canApply, true);
  assert.deepEqual(plan.actions.map(({ title, path, status }) => ({ title, path, status })), [
    { title: "Home", path: "/", status: "create" },
    { title: "About", path: "/about", status: "create" },
    { title: "Contact", path: "/contact", status: "create" },
  ]);

  const manifests = loadBlockManifests();
  const links = new Set<unknown>();
  const pages = plan.actions.map(({ path, params }, index) => {
    assert.ok(params?.blocks);
    assert.equal(params.website_id, website.id);
    assert.equal(params.is_home ?? false, path === "/");
    const blocks = params.blocks.blocks.map(({ id, type, data }) => {
      assert.ok(id);
      const manifest = manifests.find(({ slug }) => slug === type);
      assert.ok(manifest);
      for (const [key, value] of Object.entries(data)) {
        const field = manifest.schema.fields.find(({ slug }) => slug === key);
        assert.ok(field, `${type}.${key} must be editable`);
        assert.ok(!["image", "image_list", "form_select"].includes(field.type));
        if (field.type === "url") links.add(value);
        if (field.type === "repeater") {
          assert.ok(Array.isArray(value));
          for (const row of value) {
            assert.deepEqual(Object.keys(row).sort(), ["href", "label"]);
            links.add(row.href);
          }
        }
        if (field.type === "rich_text") assert.doesNotMatch(String(value), /<(?:a|img)\b/i);
      }
      return { id, type, variant: null, fields: data };
    });
    return page({
      id: `page-${index}`, title: params.title, slug: params.slug,
      pathname: path, is_home: params.is_home ?? false, blocks,
    });
  });

  assertPageBlockDefinitions(pages, true, manifests, manifests);
  assert.deepEqual(pages.map(({ blocks }) => blocks.map(({ type }) => type)), [
    ["hero", "media-with-text", "call-to-action"], ["hero", "rich-text"], ["rich-text"],
  ]);
  assert.equal(pages[0].blocks[0].fields.heading, website.app_name);
  assert.equal(pages[0].blocks[0].fields.variant, "full-bleed-image");
  assert.equal(pages[1].blocks[0].fields.variant, undefined);
  assert.equal(pages[2].blocks[0].fields.heading, "Get in touch");
  assert.deepEqual(links, new Set(["/about/", "/contact/"]));
  assert.ok(plan.warnings.some((warning) => warning.includes("canonical Menu and Locations")));
  assert.ok(plan.warnings.some((warning) => warning.includes("Edit it in Backstage")));
  assert.ok(!plan.warnings.some((warning) => warning.includes("Contact page was not created")));
});

test("restaurant Contact uses the selected form ID instead of the text fallback", () => {
  const plan = planStarterSitePages(website, [], [], "form-1", true);
  const contact = plan.actions.find(({ path }) => path === "/contact");

  assert.equal(contact?.params?.blocks?.blocks[0].type, "contact-form");
  assert.equal(contact?.params?.blocks?.blocks[0].data.form_id, "form-1");
  assert.ok(!plan.warnings.some((warning) => warning.includes("has no form")));
});

test("starter site plan preserves pages already using template paths", () => {
  const plan = planStarterSitePages(website, [
    page({ id: "home", title: "Custom homepage", slug: "/", pathname: "/", is_home: true }),
    page({ id: "about", title: "Company", slug: "about", pathname: "/about/", is_home: false }),
  ], ["/", "/about/"]);

  assert.equal(plan.canApply, true);
  assert.deepEqual(plan.actions.map(({ status }) => status), ["exists", "exists"]);
  assert.ok(plan.actions.every(({ params }) => params === undefined));
});

test("starter site plan blocks routes not owned by CMS pages", () => {
  const plan = planStarterSitePages(website, [], ["/", "/about/"]);

  assert.equal(plan.canApply, false);
  assert.deepEqual(plan.actions.map(({ status }) => status), ["route-conflict", "route-conflict"]);
});

test("apply creates only missing pages and leaves existing pages unchanged on repeat", async () => {
  const currentPages = [page({ id: "existing-home", title: "Existing Home" })];
  const created: Array<{ title: string; slug: string }> = [];
  const client = {
    pages: {
      async getHeadlessPages() { return currentPages; },
      async createPage(params: { title: string; slug: string; is_home?: boolean }) {
        created.push({ title: params.title, slug: params.slug });
        currentPages.push(page({
          id: `created-${created.length}`,
          title: params.title,
          slug: params.slug,
          pathname: params.slug === "/" ? "/" : `/${params.slug}/`,
          is_home: params.is_home ?? false,
        }));
      },
    },
    website: { async getWebsiteRoutes() { return currentPages.map(({ pathname }) => pathname); } },
  };

  const firstPlan = planStarterSitePages(website, currentPages, ["/"]);
  const firstResult = await applyStarterSitePages(client, firstPlan);
  const secondPlan = planStarterSitePages(website, currentPages, ["/", "/about/"]);
  const secondResult = await applyStarterSitePages(client, secondPlan);

  assert.deepEqual(firstResult, { created: ["/about"], preserved: ["/"] });
  assert.deepEqual(secondResult, { created: [], preserved: ["/", "/about"] });
  assert.deepEqual(created, [{ title: "About", slug: "about" }]);
  assert.equal(currentPages[0].title, "Existing Home");
});

test("apply refuses route conflicts without creating any pages", async () => {
  const writes: unknown[] = [];
  const plan = planStarterSitePages(website, [], ["/", "/about/"]);
  const client = {
    pages: {
      async getHeadlessPages() { return []; },
      async createPage(input: unknown) { writes.push(input); },
    },
    website: { async getWebsiteRoutes() { return ["/", "/about/"]; } },
  };

  await assert.rejects(() => applyStarterSitePages(client, plan), /Resolve route conflicts/);
  assert.deepEqual(writes, []);
});

test("apply catches a new route conflict before creating any planned page", async () => {
  const writes: unknown[] = [];
  const plan = planStarterSitePages(website, [], []);
  const client = {
    pages: {
      async getHeadlessPages() { return []; },
      async createPage(input: unknown) { writes.push(input); },
    },
    website: { async getWebsiteRoutes() { return ["/about/"]; } },
  };

  await assert.rejects(() => applyStarterSitePages(client, plan), /route appeared after preflight/);
  assert.deepEqual(writes, []);
});

test("restaurant apply preserves existing content and skips a Contact page created after planning", async () => {
  const home = page({ title: "Existing Home" });
  const contact = page({ id: "contact", title: "Existing Contact", slug: "contact", pathname: "/contact/", is_home: false });
  const plan = planStarterSitePages(website, [home], ["/", "/menu/"], undefined, true);
  const writes: unknown[] = [];
  const client = {
    pages: {
      async getHeadlessPages() { return [home, contact]; },
      async createPage(input: unknown) { writes.push(input); },
    },
    website: { async getWebsiteRoutes() { return ["/", "/menu/", "/contact/"]; } },
  };

  const result = await applyStarterSitePages(client, plan);
  assert.deepEqual(result, { created: ["/about"], preserved: ["/contact", "/"] });
  assert.deepEqual(writes, [plan.actions[1].params]);
});

test("restaurant apply blocks an unowned Contact route before making any writes", async () => {
  const plan = planStarterSitePages(website, [], ["/contact/?keep=1"], undefined, true);
  const writes: unknown[] = [];
  const client = {
    pages: {
      async getHeadlessPages() { return []; },
      async createPage(input: unknown) { writes.push(input); },
    },
    website: { async getWebsiteRoutes() { return ["/contact/"]; } },
  };

  assert.equal(plan.actions.find(({ path }) => path === "/contact")?.status, "route-conflict");
  await assert.rejects(() => applyStarterSitePages(client, plan), /Resolve route conflicts/);
  assert.deepEqual(writes, []);
});
