import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, sep } from "node:path";

const expected = process.argv[2];

if (expected !== "enabled" && expected !== "disabled") {
  throw new Error("Pass either 'enabled' or 'disabled'.");
}

const dist = resolve("dist");
const htmlFiles = listHtmlFiles(dist);
const renderedForms = htmlFiles.flatMap((file) => {
  const html = readFileSync(resolve(dist, file), "utf8");

  return [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/gi)]
    .map(([form]) => ({ file, form }))
    .filter(({ form }) => {
      const openingTag = form.match(/^<form\b[^>]*>/i)?.[0] ?? "";
      const classes = openingTag.match(/\bclass=["']([^"']*)["']/i)?.[1]?.split(/\s+/) ?? [];
      return classes.includes("contact-form");
    });
});

assert.ok(renderedForms.length > 0, "The built site must contain at least one configured Contact Form block.");

for (const [index, { file, form }] of renderedForms.entries()) {
  const label = `${file} Contact Form ${index + 1}`;

  if (expected === "disabled") {
    assert.match(form, /Preview only\. Form submissions are disabled\./, `${label} must explain why it cannot submit.`);
    assert.match(form, /<fieldset\b[^>]*class="contact-form__fields"[^>]*disabled/, `${label} fields must be disabled.`);
    assert.match(form, /<button\b[^>]*class="contact-form__submit"[^>]*disabled/, `${label} submit button must be disabled.`);
    assert.doesNotMatch(form, /\baction=|data-backstage-form|data-recaptcha-site-key/, `${label} must not expose submission configuration.`);
    assert.doesNotMatch(form, /name="g-recaptcha-response"/, `${label} must not render the reCAPTCHA response field.`);
  } else {
    assert.match(form, /\baction="https:\/\//, `${label} must submit to an HTTPS endpoint.`);
    assert.match(form, /\bmethod="post"/, `${label} must use POST.`);
    assert.match(form, /data-backstage-form="true"/, `${label} must enable Backstage submission handling.`);
    assert.doesNotMatch(form, /Preview only\. Form submissions are disabled\./, `${label} must not be disabled.`);
    assert.doesNotMatch(form, /<fieldset\b[^>]*class="contact-form__fields"[^>]*disabled/, `${label} fields must be enabled.`);
  }
}

console.log(`Built ${expected} Contact Form checks passed for ${renderedForms.length} forms across ${new Set(renderedForms.map(({ file }) => file)).size} pages.`);

function listHtmlFiles(directory, parent = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = parent ? `${parent}${sep}${entry.name}` : entry.name;
    return entry.isDirectory()
      ? listHtmlFiles(resolve(directory, entry.name), relative)
      : relative.endsWith(".html") ? [relative.split(sep).join("/")] : [];
  });
}
