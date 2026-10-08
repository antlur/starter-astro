import assert from "node:assert/strict";
import test from "node:test";

import { fixtureContent } from "../src/fixtures/content";
import { resolveBlueprintRoutes } from "../src/site/blueprint-routes";
import { buildSiteRoutePlan } from "../src/site/routes";

const blueprint = {
  id: "blueprint-happenings",
  name: "Happenings",
  slug: "happenings",
  description: "News and events from our community.",
  fields: [
    { name: "Title", slug: "title", type: "text", is_primary: true, show_in_list: true },
    { name: "Summary", slug: "summary", type: "text", is_primary: false, show_in_list: true },
    { name: "Story", slug: "story", type: "rich_text", is_primary: false, show_in_list: true },
    { name: "Photo", slug: "photo", type: "image", is_primary: false, show_in_list: false },
    { name: "Attachment", slug: "attachment", type: "media", is_primary: false, show_in_list: false },
    { name: "Registration", slug: "registration", type: "url", is_primary: false, show_in_list: false },
  ],
};

const indexResponse = {
  type: "happenings",
  meta: { id: blueprint.id, type: "happenings", path: "/happenings/", blueprint },
  data: [
    {
      id: "published-entry",
      slug: "community-supper",
      primary_field_value: "Community Supper",
      unstable_data: { title: "Community Supper", summary: "A night around the table." },
    },
    {
      id: "draft-entry",
      slug: "draft-story",
      primary_field_value: "Draft Story",
      unstable_data: { title: "Draft Story" },
    },
  ],
};

const entryResponse = {
  type: "happening",
  meta: { id: "published-entry", type: "happening", path: "/locations/tampa/community-supper/", blueprint },
  data: {
    id: "published-entry",
    slug: "community-supper",
    primary_field_value: "Community Supper",
    seo: { title: "Join us for supper", description: "A shared meal at Fieldwork." },
    unstable_data: {
      title: "Community Supper",
      summary: "A night around the table.",
      story: '<p>Welcome.</p><script>alert("x")</script><a href="javascript:alert(1)">Unsafe link</a>',
      photo: { url: "javascript:alert(1)", file_name: "bad.jpg" },
      attachment: { url: "https://cdn.example.test/private-events.pdf", file_name: "Private events details.pdf" },
      registration: "/private-events/?source=happening",
    },
  },
};

test("renders only blueprint entries with canonical public detail routes", async () => {
  const requested: string[] = [];
  const resolved = await resolveBlueprintRoutes(["/happenings/", "/locations/tampa/community-supper/"], async (path) => {
    requested.push(path);
    return path === "/happenings/" ? indexResponse : entryResponse;
  });

  assert.deepEqual(requested, ["/happenings/", "/locations/tampa/community-supper/"]);
  assert.deepEqual(resolved.unhandledPaths, []);
  assert.equal(resolved.routes.length, 2);

  const index = resolved.routes.find((route) => route.kind === "index");
  assert.ok(index && index.kind === "index");
  assert.deepEqual(index.entries.map(({ id, path, title }) => ({ id, path, title })), [
    { id: "published-entry", path: "/locations/tampa/community-supper/", title: "Community Supper" },
  ]);

  const sitePlan = buildSiteRoutePlan({
    ...fixtureContent,
    routePaths: [...fixtureContent.routePaths, "/happenings/", "/locations/tampa/community-supper/"],
    navigation: [
      ...fixtureContent.navigation,
      { id: "happenings", text: "Happenings", url: "/happenings/", newWindow: false, children: [] },
    ],
  }, [], resolved.routes);

  assert.deepEqual(sitePlan.unhandledPaths, []);
  assert.equal(sitePlan.navigation.at(-1)?.url, "/happenings/");
});

test("sanitizes rich text and excludes unsafe media URLs from blueprint details", async () => {
  const resolved = await resolveBlueprintRoutes(["/locations/tampa/community-supper/"], async () => entryResponse);
  const entry = resolved.routes[0];

  assert.ok(entry && entry.kind === "entry");
  if (!entry || entry.kind !== "entry") return;

  assert.equal(entry.fields.some(({ slug }) => slug === "title"), false);
  const story = entry.fields.find(({ slug }) => slug === "story");
  assert.ok(story?.value.kind === "html");
  if (story?.value.kind === "html") {
    assert.match(story.value.html, /<p>Welcome\.<\/p>/);
    assert.doesNotMatch(story.value.html, /script|javascript:/i);
  }

  assert.equal(entry.fields.some(({ slug }) => slug === "photo"), false);
  assert.deepEqual(entry.fields.find(({ slug }) => slug === "attachment")?.value, {
    kind: "files",
    files: [{ href: "https://cdn.example.test/private-events.pdf", label: "Private events details.pdf" }],
  });
  assert.deepEqual(entry.fields.find(({ slug }) => slug === "registration")?.value, {
    kind: "text",
    text: "/private-events/?source=happening",
    href: "/private-events/?source=happening",
  });
  assert.equal(entry.seoTitle, "Join us for supper");
  assert.equal(entry.seoDescription, "A shared meal at Fieldwork.");
});

test("preserves intrinsic dimensions for safe blueprint images", async () => {
  const response = structuredClone(entryResponse);
  response.data.unstable_data.photo = {
    url: "https://cdn.example.test/community-supper.jpg",
    file_name: "community-supper.jpg",
  };
  Object.assign(response.data.unstable_data.photo, { width: 1600, height: 900 });

  const resolved = await resolveBlueprintRoutes(["/locations/tampa/community-supper/"], async () => response);
  const entry = resolved.routes[0];
  assert.ok(entry && entry.kind === "entry");
  if (!entry || entry.kind !== "entry") return;

  assert.deepEqual(entry.fields.find(({ slug }) => slug === "photo")?.value, {
    kind: "images",
    images: [{ src: "https://cdn.example.test/community-supper.jpg", alt: "Photo", width: 1600, height: 900 }],
  });
});

test("rejects mismatched resolver paths and keeps non-blueprint routes unhandled", async () => {
  await assert.rejects(
    () => resolveBlueprintRoutes(["/happenings/"], async () => ({
      ...indexResponse,
      meta: { ...indexResponse.meta, path: "/different/" },
    })),
    /different canonical path/,
  );

  const resolved = await resolveBlueprintRoutes(["/menus/"], async () => ({
    type: "menu",
    data: {},
    meta: { id: "menu", type: "menu", path: "/menus/" },
  }));

  assert.deepEqual(resolved.routes, []);
  assert.deepEqual(resolved.unhandledPaths, ["/menus/"]);
});
