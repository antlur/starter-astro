import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { formatMenuPrice, normalizeMenu, selectMenuForIndex } from "../src/lib/backstage/menus";

test("preserves authored currency formatting for menu prices", () => {
  assert.equal(formatMenuPrice("$13.00"), "$13.00");
  assert.equal(formatMenuPrice("$ 13.00 "), "$ 13.00");
  assert.equal(formatMenuPrice("13,00 €"), "13,00 €");
});

test("normalizes Backstage menu categories, rich descriptions, and labeled prices", () => {
  const menu = normalizeMenu({
    id: "menu-1",
    title: "Dinner",
    slug: "dinner",
    subtitle: null,
    pdf_url: "https://cdn.example.test/dinner.pdf",
    categories: [{
      id: "category-1",
      title: "Pizza",
      description: "<p>Made fresh.</p>",
      after_description: "<p>Gluten-free crust available.</p>",
      column_count: "2",
      items: [{
        id: "placement-1",
        title: "House pie",
        description: "<p>Tomato, mozzarella, basil.</p>",
        price: null,
        prices: [{ label: "Small", value: "18.00" }, { label: "Large", value: "26.00" }],
        image: { url: "https://cdn.example.test/pizza.jpg", alt: "House pizza" },
      }],
    }],
  });

  assert.equal(menu.title, "Dinner");
  assert.equal(menu.pdfUrl, "https://cdn.example.test/dinner.pdf");
  assert.equal(menu.categories[0].columns, 2);
  assert.equal(menu.categories[0].afterDescription, "<p>Gluten-free crust available.</p>");
  assert.deepEqual(menu.categories[0].items[0].prices, [
    { label: "Small", value: "18.00" },
    { label: "Large", value: "26.00" },
  ]);
  assert.equal(menu.categories[0].items[0].imageAlt, "House pizza");
});

test("sorts categories by Backstage order and keeps unordered categories stable at the end", () => {
  const menu = normalizeMenu({
    id: "menu-1",
    title: "Dinner",
    slug: "dinner",
    categories: [
      { title: "Unordered first", order: null, items: [] },
      { title: "Second", order: "2", items: [] },
      { title: "First", order: 1, items: [] },
      { title: "Unordered second", items: [] },
    ],
  });

  assert.deepEqual(menu.categories.map((category) => category.title), [
    "First",
    "Second",
    "Unordered first",
    "Unordered second",
  ]);
});

test("prefers structured labeled prices when they disagree with the legacy price string", () => {
  const menu = normalizeMenu({
    id: "menu-1",
    title: "Dinner",
    slug: "dinner",
    categories: [{
      title: "Pizza",
      items: [{
        title: "House pie",
        price: "24.99 | 33.99",
        prices: [
          { label: "Small (12 inch)", value: "23.99" },
          { label: "Large (18 inch)", value: "32.99" },
        ],
      }],
    }],
  });

  const item = menu.categories[0].items[0];
  assert.equal(item.price, null);
  assert.deepEqual(item.prices, [
    { label: "Small (12 inch)", value: "23.99" },
    { label: "Large (18 inch)", value: "32.99" },
  ]);
});

test("uses menu placement overrides rather than global catalog item data", () => {
  const menu = normalizeMenu({
    id: "menu-1",
    title: "Dinner",
    slug: "dinner",
    categories: [{
      title: "Pizza",
      items: [{
        id: "placement-1",
        title: "Local title",
        post_title: "Local display title",
        description: "Local description",
        price_type: "single",
        price: "21.00",
        prices: null,
        dietary_tags: ["vegan"],
        image: null,
        has_hidden_price: false,
        menu_item: {
          title: "Global title",
          post_title: "Global display title",
          description: "Global description",
          price_type: "multiple",
          price: "99.00",
          prices: [{ label: "Large", value: "99.00" }],
          dietary_tags: ["vegetarian"],
          image: { url: "https://cdn.example.test/global.jpg", alt: "Global image" },
        },
      }],
    }],
  });

  const item = menu.categories[0].items[0];
  assert.equal(item.title, "Local title");
  assert.equal(item.postTitle, "Local display title");
  assert.equal(item.description, "Local description");
  assert.equal(item.priceType, "single");
  assert.deepEqual(item.dietaryTags, ["vegan"]);
  assert.deepEqual(item.prices, [{ label: "", value: "21.00" }]);
  assert.equal(item.imageUrl, null);
});

test("inherits global display fields and scalar prices when a placement has no overrides", () => {
  const menu = normalizeMenu({
    id: "menu-1",
    title: "Dinner",
    slug: "dinner",
    categories: [{
      title: "Entrees",
      items: [{
        id: "placement-1",
        title: null,
        post_title: null,
        subtitle: "",
        description: null,
        price_type: null,
        price: null,
        price2: null,
        prices: [],
        dietary_tags: null,
        menu_item: {
          title: "Roasted salmon",
          post_title: "Line-caught",
          subtitle: "Dinner favorite",
          description: "Served with seasonal vegetables.",
          price_type: "multiple",
          price: "24.00",
          price2: "32.00",
          prices: null,
          dietary_tags: ["gluten-free", "dairy-free"],
        },
      }],
    }],
  });

  const item = menu.categories[0].items[0];
  assert.equal(item.title, "Roasted salmon");
  assert.equal(item.postTitle, "Line-caught");
  assert.equal(item.subtitle, "Dinner favorite");
  assert.equal(item.description, "Served with seasonal vegetables.");
  assert.equal(item.priceType, "multiple");
  assert.deepEqual(item.dietaryTags, ["gluten-free", "dairy-free"]);
  assert.deepEqual(item.prices, [
    { label: "", value: "24.00" },
    { label: "", value: "32.00" },
  ]);
});

test("hides prices when the effective Backstage price type is hidden", () => {
  const menu = normalizeMenu({
    id: "menu-1",
    title: "Dinner",
    slug: "dinner",
    categories: [{
      title: "Entrees",
      items: [{
        title: "Market fish",
        price_type: "hidden",
        has_hidden_price: false,
        price: "28.00",
      }],
    }],
  });

  const item = menu.categories[0].items[0];
  assert.equal(item.priceType, "hidden");
  assert.equal(item.hiddenPrice, true);
  assert.deepEqual(item.prices, []);
});

test("resolves menu image IDs while respecting a placement-level image override", () => {
  const mediaById = new Map([
    ["12", { url: "https://cdn.example.test/global.jpg", alt: "Global image", width: 800, height: 800 }],
    ["34", { url: "https://cdn.example.test/local.jpg", alt: "Local image", width: 600, height: 400 }],
  ]);
  const menu = normalizeMenu({
    id: "menu-1",
    title: "Dinner",
    slug: "dinner",
    categories: [{
      title: "Pizza",
      items: [
        {
          title: "House pie",
          image_id: 34,
          menu_item: { image_id: 12 },
        },
        {
          title: "Plain pie",
          image_id: null,
          menu_item: { image_id: 12 },
        },
        {
          title: "Global pie",
          menu_item: { image_id: 12 },
        },
      ],
    }],
  }, 0, mediaById);

  assert.equal(menu.categories[0].items[0].imageUrl, "https://cdn.example.test/local.jpg");
  assert.equal(menu.categories[0].items[0].imageAlt, "Local image");
  assert.equal(menu.categories[0].items[0].imageWidth, 600);
  assert.equal(menu.categories[0].items[0].imageHeight, 400);
  assert.equal(menu.categories[0].items[1].imageUrl, null);
  assert.equal(menu.categories[0].items[2].imageUrl, "https://cdn.example.test/global.jpg");
});

test("supports legacy pipe-separated prices while rejecting unsafe media links", () => {
  const menu = normalizeMenu({
    id: "menu-1",
    title: "Dinner",
    slug: "dinner",
    pdf_url: "javascript:alert(1)",
    categories: [{
      title: "Entrees",
      items: [{
        title: "Pasta",
        price: "16.00 | 22.00",
        image: { url: "javascript:alert(1)", alt: "Unsafe" },
      }],
    }],
  });

  assert.equal(menu.pdfUrl, null);
  assert.deepEqual(menu.categories[0].items[0].prices, [
    { label: "", value: "16.00" },
    { label: "", value: "22.00" },
  ]);
  assert.equal(menu.categories[0].items[0].imageUrl, null);
});

test("normalizes keyed local prices, serves, and menu publication metadata", () => {
  const menu = normalizeMenu({
    id: "menu-1",
    title: "Dinner",
    slug: "dinner",
    is_default: true,
    published_at: "2026-10-01T12:00:00Z",
    categories: [{
      title: "Family plates",
      serves: "3-4",
      pricing_columns: ["Half", { label: "Full" }],
      items: [{
        title: "Roast chicken",
        serves: "2",
        prices: {
          Half: { value: "18.00" },
          Full: { price: "32.00" },
        },
        menu_item: {
          serves: "4",
          price_type: "hidden",
          has_hidden_price: true,
          prices: { Half: "90.00", Full: "120.00" },
        },
      }],
    }],
  });

  assert.equal(menu.isDefault, true);
  assert.equal(menu.isPublished, true);
  assert.equal(menu.categories[0].serves, "3-4");
  assert.deepEqual(menu.categories[0].pricingColumns, ["Half", "Full"]);
  assert.equal(menu.categories[0].items[0].serves, "2");
  assert.deepEqual(menu.categories[0].items[0].prices, [
    { label: "Half", value: "18.00" },
    { label: "Full", value: "32.00" },
  ]);
  assert.equal(menu.categories[0].items[0].hiddenPrice, false);
  assert.equal(normalizeMenu({ id: "menu-2", title: "Draft", slug: "draft", published_at: null, categories: [] }).isPublished, false);
});

test("formats numeric menu prices as USD and preserves descriptive values", () => {
  assert.equal(formatMenuPrice("3.5"), "$3.50");
  assert.equal(formatMenuPrice("$1,234.5"), "$1,234.5");
  assert.equal(formatMenuPrice("Market price"), "Market price");
  assert.equal(formatMenuPrice("$12.00 - $18.00"), "$12.00 - $18.00");
});

test("uses pricing columns to label array and legacy fallback prices", () => {
  const menu = normalizeMenu({
    id: "menu-1",
    title: "Dinner",
    slug: "dinner",
    categories: [{
      title: "Pasta",
      pricing_columns: [{ label: "Half" }, { label: "Full" }],
      items: [
        { title: "Baked ziti", prices: ["12.00", { value: "18.00" }] },
        { title: "Lasagna", price: "14.00 | 20.00" },
      ],
    }],
  });

  assert.deepEqual(menu.categories[0].items.map(({ prices }) => prices), [
    [{ label: "Half", value: "12.00" }, { label: "Full", value: "18.00" }],
    [{ label: "Half", value: "14.00" }, { label: "Full", value: "20.00" }],
  ]);
});

test("renders category and item serving counts and normalized price labels", async () => {
  const menuPage = await readFile(new URL("../src/components/MenuPage.astro", import.meta.url), "utf8");

  assert.match(menuPage, /category\.serves && <p class="menu-category__serves">Serves \{category\.serves\}<\/p>/);
  assert.match(menuPage, /item\.serves && <p class="menu-item__serves">Serves \{item\.serves\}<\/p>/);
  assert.match(menuPage, /item\.prices\[0\]\?\.label && <span class="menu-item__price-label">\{item\.prices\[0\]\.label\}<\/span>/);
  assert.match(menuPage, /price\.label && <dt>\{price\.label\}<\/dt>/);
});

test("uses resolver menu IDs first and otherwise follows the location association order", () => {
  const defaultMenu = normalizeMenu({
    id: "menu-default",
    title: "Default",
    slug: "default",
    is_default: true,
    published_at: "2026-10-01T12:00:00Z",
    categories: [],
  });
  const firstAssociatedMenu = normalizeMenu({
    id: "menu-associated-first",
    title: "First associated",
    slug: "first-associated",
    published_at: "2026-10-01T12:00:00Z",
    categories: [],
  });
  const menus = [defaultMenu, firstAssociatedMenu];

  assert.equal(
    selectMenuForIndex(menus, null, ["menu-associated-first", "menu-default"])?.id,
    "menu-associated-first",
  );
  assert.equal(
    selectMenuForIndex(menus, "menu-default", ["menu-associated-first", "menu-default"])?.id,
    "menu-default",
  );
});

test("only publishes menus with a publication date before the build time", () => {
  const now = new Date("2026-10-11T12:00:00.000Z");
  const menu = (id: string, published_at: string | null) => normalizeMenu({
    id,
    title: id,
    slug: id,
    published_at,
    categories: [],
  }, 0, new Map(), now);

  assert.equal(menu("past", "2026-10-11T11:59:59.000Z").isPublished, true);
  assert.equal(menu("future", "2026-10-11T12:00:01.000Z").isPublished, false);
  assert.equal(menu("unscheduled", null).isPublished, false);
  assert.equal(normalizeMenu({ id: "legacy", title: "Legacy", slug: "legacy", categories: [] }, 0, new Map(), now).isPublished, null);
  assert.equal(
    selectMenuForIndex([
      menu("future", "2026-10-11T12:00:01.000Z"),
      menu("past", "2026-10-11T11:59:59.000Z"),
    ], null, ["future", "past"])?.id,
    "past",
  );
});

test("uses canonical resolver menu identity for generated menu-index paths", async () => {
  const routePage = await readFile(new URL("../src/pages/[...slug].astro", import.meta.url), "utf8");

  assert.match(routePage, /routeMeta\?\.type === "menu" \? routeMeta\.id : null/);
  assert.match(routePage, /selectMenuForIndex\(indexedMenuCandidates, resolverMenuId, location\?\.menuIds\)/);
  assert.doesNotMatch(routePage, /isDefault/);
});
