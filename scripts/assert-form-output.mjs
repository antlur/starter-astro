import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const expected = process.argv[2];

if (expected !== "enabled" && expected !== "disabled") {
  throw new Error("Pass either 'enabled' or 'disabled'.");
}

const html = readFileSync("dist/contact/index.html", "utf8");
const form = html.match(/<form\b[^>]*class="contact-form"[^>]*>/)?.[0];

assert.ok(form, "The built Contact page must contain its configured form.");

if (expected === "disabled") {
  assert.match(html, /Preview only\. Form submissions are disabled\./);
  assert.match(html, /<fieldset\b[^>]*class="contact-form__fields"[^>]*disabled/);
  assert.match(html, /<button\b[^>]*class="contact-form__submit"[^>]*disabled/);
  assert.doesNotMatch(form, /\baction=|data-backstage-form|data-recaptcha-site-key/);
  assert.doesNotMatch(html, /name="g-recaptcha-response"/);
} else {
  assert.match(form, /\baction="https:\/\//);
  assert.match(form, /\bmethod="post"/);
  assert.match(form, /data-backstage-form="true"/);
  assert.doesNotMatch(html, /Preview only\. Form submissions are disabled\./);
  assert.doesNotMatch(html, /<fieldset\b[^>]*class="contact-form__fields"[^>]*disabled/);
}

console.log(`Built Contact form is ${expected}.`);
