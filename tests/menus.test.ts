import assert from "node:assert/strict";
import test from "node:test";
import { formatMenuPrice, normalizeMenu } from "../src/lib/backstage/menus";

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
    ["12", { url: "https://cdn.example.test/global.jpg", alt: "Global image" }],
    ["34", { url: "https://cdn.example.test/local.jpg", alt: "Local image" }],
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
