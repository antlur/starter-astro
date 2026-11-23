import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

// Resolve the parser through sanitize-html, which already depends on it.
const { parseDocument, DomUtils } = createRequire(import.meta.resolve("sanitize-html"))("htmlparser2");

const mode = process.argv[2] ?? "preview";
const outDir = process.argv[3] ?? "dist";
assert.ok(["preview", "indexable"].includes(mode), "Pass either 'preview' or 'indexable'.");
const siteUrl = process.env.SITE_URL;
if (mode === "indexable") assert.ok(siteUrl, "Set SITE_URL to the origin used for the build.");

const branches = [
  {
    slug: "market-street",
    name: "Market Street",
    phone: "3125550111",
    menus: { "market-all-day": "Charred squash toast", "market-brunch": "Market biscuit plate" },
    ordering: "https://toast.example.test/market-street",
    reservation: "https://resy.example.test/market-street",
  },
  {
    slug: "riverfront",
    name: "Riverfront",
    phone: "3125550112",
    menus: { "river-all-day": "Charred squash toast", "river-supper": "River white bean stew" },
    ordering: "https://chownow.example.test/riverfront",
    waitlist: "https://yelp.example.test/riverfront",
  },
  { slug: "north-loop", name: "North Loop", phone: "3125550113", reservation: "https://opentable.example.test/north-loop" },
  { slug: "west-end", name: "West End", phone: "3125550114", waitlist: "https://yelp.example.test/west-end" },
  { slug: "south-lawn", name: "South Lawn", phone: "3125550115" },
];

const branchPath = (branch) => `/locations/${branch.slug}/`;
const outputFile = (path) => join(outDir, path.slice(1), "index.html");
const elements = (root, name) => DomUtils.findAll((node) => node.name === name, root.children);
const text = (node) => DomUtils.textContent(node).replace(/\s+/g, " ").trim();
const hasClass = (node, name) => node.attribs.class?.split(/\s+/).includes(name);
const links = (root) => elements(root, "a").flatMap((node) => node.attribs.href ? [node.attribs.href] : []);
const branchCard = (main, branch) => elements(main, "article").find((card) =>
  elements(card, "h2").some((heading) => text(heading) === branch.name),
);
const topbar = (doc) => {
  const element = DomUtils.findOne((node) => hasClass(node, "site-topbar"), doc.children);
  assert.ok(element, "The site must render a topbar.");
  return element;
};

function readPage(path, heading) {
  const file = outputFile(path);
  assert.ok(existsSync(file), `${path} needs built HTML. Build with BACKSTAGE_SOURCE=fixture BACKSTAGE_FIXTURE=multi-location.`);
  const html = readFileSync(file, "utf8");
  assert.doesNotMatch(html, /Private Test Kitchen|test-kitchen|3125550116/i, `${path} must not expose the hidden location.`);
  const doc = parseDocument(html);
  const main = elements(doc, "main").find((node) => node.attribs.id === "main-content");
  assert.ok(main, `${path} needs a main landmark.`);
  assert.deepEqual(elements(main, "h1").map(text), [heading], `${path} needs the expected page heading.`);
  const robots = elements(doc, "meta").find((node) => node.attribs.name === "robots")?.attribs.content;
  assert.equal(robots?.replace(/\s/g, ""), mode === "indexable" ? "index,follow" : "noindex,nofollow", `${path} robots directive`);
  if (siteUrl) {
    const canonicals = elements(doc, "link").filter((node) => node.attribs.rel === "canonical").map((node) => node.attribs.href);
    assert.deepEqual(canonicals, [new URL(path, siteUrl).href], `${path} must be self-canonical.`);
  }
  return { doc, main };
}

const providerLinks = (root) => links(root).filter((href) =>
  /^https:\/\/[^/]+\.example\.test\//.test(href) && !href.startsWith("https://maps.example.test/"),
);
const assertProviders = (root, expected, path) => {
  assert.deepEqual([...new Set(providerLinks(root))].sort(), expected.filter(Boolean).sort(), `${path} must link only to eligible providers.`);
};
const assertMenuLinks = (root, expected, path) => {
  const actual = links(root).filter((href) => /^\/(?:menu\/[^/]|locations\/[^/]+\/menu\/)/.test(href));
  assert.deepEqual([...new Set(actual)].sort(), [...expected].sort(), `${path} menu links must stay within the active branch.`);
};

const { doc: home, main: homeMain } = readPage("/", "Fieldwork Kitchen");
assert.ok(links(homeMain).includes("/menu/") && links(homeMain).includes("/locations/"), "Home must lead to the menu and location directory.");
const { main: about } = readPage("/about/", "About Fieldwork Kitchen");
assert.ok(elements(about, "section").some((node) => hasClass(node, "hero--compact")));
assert.ok(elements(about, "section").some((node) => hasClass(node, "media-text--edge-to-edge") && hasClass(node, "media-text--inverse")));
assert.equal(elements(homeMain, "article").filter((node) => hasClass(node, "card-grid__item--lead")).length, 1);
for (const [main, layout] of [[homeMain, "photo-grid"], [about, "compact"]]) {
  const section = elements(main, "section").find((node) => hasClass(node, `location-directory--${layout}`));
  assert.ok(section, `Render the ${layout} Locations block.`);
  const cards = elements(section, "article");
  assert.equal(cards.length, branches.length);
  assert.equal(elements(section, "img").length, layout === "photo-grid" ? 1 : 0);
  for (const branch of branches) {
    const card = cards.find((node) => elements(node, "h3").some((heading) => text(heading) === branch.name));
    assert.ok(card);
    assert.ok(links(card).includes(branchPath(branch)));
    assertProviders(card, [branch.ordering, branch.reservation, branch.waitlist], branch.name);
    const menus = branch.menus ?? { "all-day": "Charred squash toast" };
    assertMenuLinks(card, Object.keys(menus).map((slug) => `${branchPath(branch)}menu/${slug}/`), branch.name);
  }
}
const { main: contact } = readPage("/contact/", "Get in touch");
assert.ok(elements(contact, "fieldset").some(({ attribs }) => "disabled" in attribs), "The synthetic Contact form must be disabled.");
assert.ok(elements(contact, "form").every(({ attribs }) => !attribs.action), "The synthetic Contact form must not submit.");
if (process.env.BACKSTAGE_SITE_PROFILE === "restaurant") {
  const html = elements(home, "html")[0];
  assert.match(html.attribs.style ?? "", /--brand-color-primary:\s*#583124/i);
  assert.match(html.attribs.style ?? "", /--theme-color-action:\s*#874027/i);
}
const homeTopbar = topbar(home);
assert.ok(elements(homeTopbar, "a").some((node) =>
  node.attribs.href === "/locations/" && text(node) === "Find a location"
), "The global topbar must link to the location directory.");
assert.ok(links(homeTopbar).every((href) => !href.startsWith("tel:")), "The global topbar must not show a branch phone.");
assert.ok(branches.every(({ phone }) => !text(homeTopbar).replace(/\D/g, "").includes(phone)), "The global topbar must not show branch phone text.");

const primary = elements(home, "nav").find((node) => node.attribs.id === "site-primary-navigation");
assert.ok(primary, "The home page must render primary navigation.");
for (const path of ["/locations/", "/menu/", "/order-online/", "/reservations/", "/waitlist/"]) {
  assert.ok(links(primary).includes(path), `Primary navigation must link to ${path}.`);
}
assert.ok(elements(primary, "a").some((node) =>
  node.attribs.href === "/order-online/" && hasClass(node, "site-nav-link--button")
), "Order online must be the primary action.");

const { main: directory } = readPage("/locations/", "Our locations");
const { main: menuChooser } = readPage("/menu/", "Choose a location");
for (const branch of branches) {
  const path = branchPath(branch);
  const menus = branch.menus ?? { "all-day": "Charred squash toast" };
  const menuPaths = Object.keys(menus).map((slug) => `${path}menu/${slug}/`);
  assert.ok(links(directory).includes(path), `The directory must link to ${path}.`);
  if (process.env.BACKSTAGE_SITE_PROFILE === "restaurant") {
    const locationCard = branchCard(directory, branch);
    assert.ok(locationCard, `The locations directory must show ${branch.name}.`);
    assertMenuLinks(locationCard, menuPaths, `/locations/ (${branch.name})`);
  }
  const menuCard = branchCard(menuChooser, branch);
  assert.ok(menuCard, `The menu chooser must show ${branch.name}.`);
  assert.ok(links(menuCard).includes(path), `The menu chooser must link to ${path}.`);
  assertMenuLinks(menuCard, menuPaths, `/menu/ (${branch.name})`);

  const { doc, main } = readPage(path, `Visit ${branch.name}`);
  assert.deepEqual(links(topbar(doc)).filter((href) => href.startsWith("tel:")), [`tel:${branch.phone}`], `${path} topbar must use its own phone.`);
  assertProviders(main, [branch.ordering, branch.reservation, branch.waitlist], path);
  assertMenuLinks(main, menuPaths, path);

  if (branch.slug === "market-street") {
    const hours = text(main);
    for (const label of ["Regular Hours", "Brunch Hours", "Winter Holiday"]) {
      assert.ok(hours.includes(label), `${path} must render ${label}.`);
    }
    assert.match(hours, /11\s*AM\s*[-\u2013\u2014]\s*9\s*PM/i, "Show the regular hours.");
    assert.match(hours, /9\s*AM\s*[-\u2013\u2014]\s*1\s*PM/i, "Show the separate brunch hours.");
    const date = elements(main, "time").find((node) => node.attribs.datetime === "2030-12-25");
    assert.ok(date, "Show the date of the fixture holiday closure.");
    const holiday = date.parent;
    assert.match(text(holiday), /Winter Holiday/, "Associate the date with the named holiday.");
    assert.equal(text(elements(holiday.parent, "dd")[0]), "Closed", "Mark the winter holiday as closed.");
  } else {
    assert.ok(!text(main).includes("Winter Holiday"), `${path} must not inherit another branch's closure.`);
  }

  for (const [slug, item] of Object.entries(menus)) {
    const menuPath = `${path}menu/${slug}/`;
    const heading = ({
      "all-day": "All Day",
      "market-all-day": "Market All Day",
      "river-all-day": "River All Day",
      "market-brunch": "Market Brunch",
      "river-supper": "River Supper",
    })[slug];
    const { main: menu } = readPage(menuPath, heading);
    assert.ok(text(menu).includes(item), `${menuPath} must show ${item}.`);
    for (const otherItem of ["Charred squash toast", "Market biscuit plate", "River white bean stew"]) {
      if (otherItem !== item) assert.ok(!text(menu).includes(otherItem), `${menuPath} must not show ${otherItem}.`);
    }
    assertMenuLinks(menu, menuPaths.length > 1 ? menuPaths : [], menuPath);
    if (process.env.BACKSTAGE_SITE_PROFILE === "restaurant") {
      const visit = DomUtils.findOne((node) => hasClass(node, "menu-page__visit"), menu.children);
      assert.ok(visit, `${menuPath} must offer a next step to plan a visit.`);
      assert.deepEqual(links(visit), [path], `${menuPath} must link only to its own location from the visit action.`);
    }
  }
}

for (const [service, path, heading] of [
  ["ordering", "/order-online/", "Order online"],
  ["reservation", "/reservations/", "Reservations"],
  ["waitlist", "/waitlist/", "Join the waitlist"],
]) {
  const { main } = readPage(path, heading);
  assertProviders(main, branches.map((branch) => branch[service]), path);
  for (const branch of branches) {
    const card = branchCard(main, branch);
    assert.equal(Boolean(card), Boolean(branch[service]), `${path} eligibility for ${branch.name}`);
    if (card) {
      assert.ok(links(card).includes(branchPath(branch)), `${path} must link to ${branchPath(branch)}.`);
      assertProviders(card, [branch[service]], `${path} (${branch.name})`);
    }
  }
}

for (const path of ["/locations/test-kitchen/", "/locations/test-kitchen/menu/all-day/", "/menu/all-day/", "/menu/market-brunch/", "/menu/river-supper/"]) {
  assert.ok(!existsSync(outputFile(path)), `Do not emit a hidden or unscoped page at ${path}.`);
}

console.log(`Built ${mode} multi-location site checks passed.`);
