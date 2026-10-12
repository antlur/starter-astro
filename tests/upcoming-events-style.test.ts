import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(
  new URL("../src/blocks/upcoming-events/UpcomingEvents.astro", import.meta.url),
  "utf8",
);

test("Upcoming Events View All CTA keeps the filled button's readable contrast", () => {
  const style = component.match(/<style>([\s\S]*?)<\/style>/)?.[1];
  assert.ok(style, "Upcoming Events component should define its styles");

  const buttonColors = (targetSelector: string) => {
    const declarations = new Map<string, string>();
    for (const [, selectors, body] of style.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!selectors.split(",").some((selector) => selector.trim() === targetSelector)) continue;

      for (const [, property, value] of body.matchAll(/(background|color)\s*:\s*([^;]+);/g)) {
        declarations.set(property, value.trim());
      }
    }
    return declarations;
  };

  const viewAll = buttonColors(".upcoming-events__view-all a");
  const filledEventAction = buttonColors(".upcoming-events__actions a:last-child");

  assert.equal(viewAll.get("background"), "var(--color-accent-strong)");
  assert.equal(viewAll.get("color"), "white");
  assert.deepEqual(Object.fromEntries(viewAll), Object.fromEntries(filledEventAction));
});
