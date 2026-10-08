import assert from "node:assert/strict";
import test from "node:test";
import { resolveSeoMetadata } from "../src/lib/seo-metadata";

const site = {
  name: "Fieldwork Coffee",
  meta: { description: "A neighborhood cafe." },
  openGraph: { title: "Fieldwork Coffee | Welcome", description: "Visit Fieldwork Coffee." },
};

test("uses page-specific content for descriptions and social titles", () => {
  const metadata = resolveSeoMetadata({
    page: {
      title: "Our Story",
      is_home: false,
      blocks: [{ id: "story", type: "rich-text", fields: { body: "<p>Independent coffee, thoughtfully sourced and served daily.</p>" } }],
    },
    site,
  });

  assert.equal(metadata.title, "Our Story | Fieldwork Coffee");
  assert.equal(metadata.description, "Independent coffee, thoughtfully sourced and served daily.");
  assert.equal(metadata.openGraphTitle, metadata.title);
  assert.equal(metadata.openGraphDescription, metadata.description);
});

test("keeps explicit page metadata above block and site fallbacks", () => {
  const metadata = resolveSeoMetadata({
    page: {
      title: "Our Story",
      is_home: false,
      meta: { title: "How We Started", description: "<p>Page description.</p>" },
      blocks: [{ id: "story", type: "rich-text", fields: { body: "Block description." } }],
    },
    site,
  });

  assert.equal(metadata.title, "How We Started | Fieldwork Coffee");
  assert.equal(metadata.description, "Page description.");
  assert.equal(metadata.openGraphTitle, "How We Started");
});

test("uses the site Open Graph title only for the home page", () => {
  const page = { title: "About", is_home: false, blocks: [] };
  const home = { ...page, title: "Home", is_home: true };

  assert.equal(resolveSeoMetadata({ page, site }).openGraphTitle, "About | Fieldwork Coffee");
  assert.equal(resolveSeoMetadata({ page: home, site }).openGraphTitle, "Fieldwork Coffee | Welcome");
});

test("derives safe, concise descriptions from rich text", () => {
  const metadata = resolveSeoMetadata({
    page: {
      title: "Contact",
      is_home: false,
      blocks: [{ id: "story", type: "rich-text", fields: { body: `<p>${"Visit us & enjoy a fresh cup. ".repeat(10)}</p><script>ignore this</script>` } }],
    },
    site,
  });

  assert.ok(metadata.description.length <= 160);
  assert.ok(metadata.description.includes("&"));
  assert.ok(!metadata.description.includes("ignore this"));
  assert.ok(metadata.description.endsWith("..."));
});
