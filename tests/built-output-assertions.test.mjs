import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const builtSiteScript = fileURLToPath(new URL("../scripts/assert-built-site.mjs", import.meta.url));
const formOutputScript = fileURLToPath(new URL("../scripts/assert-form-output.mjs", import.meta.url));

const withOutput = (run) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "starter-astro-output-checks-"));
  mkdirSync(path.join(root, "dist"), { recursive: true });

  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

const runScript = (script, argument, cwd) => spawnSync(process.execPath, [script, argument], {
  cwd,
  encoding: "utf8",
});

const page = (body) => `<!doctype html><html lang="en"><head><title>Sample</title><meta name="robots" content="noindex, nofollow"></head><body><a href="#main-content">Skip to content</a><main id="main-content">${body}</main></body></html>`;

const writePage = (root, route, html) => {
  const output = path.join(root, "dist", route);
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, html);
};

test("built-site checks accept valid LocalBusiness data on a non-Chicago location route", () => {
  withOutput((root) => {
    const business = {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: "Rose City Cafe",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Portland",
        postalCode: "97201",
      },
      openingHoursSpecification: [{
        "@type": "OpeningHoursSpecification",
        dayOfWeek: "https://schema.org/Wednesday",
        opens: "08:00",
        closes: "16:00",
      }],
    };

    writePage(root, "index.html", page("Home"));
    writePage(root, "visit/rose-city/index.html", page(`<script type="application/ld+json">${JSON.stringify(business)}</script>`));
    writeFileSync(path.join(root, "dist", "robots.txt"), "User-agent: *\nDisallow: /\n");

    const result = runScript(builtSiteScript, "preview", root);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /checks passed for 2 routes/);
  });
});

test("built-site checks retain generic LocalBusiness address validation", () => {
  withOutput((root) => {
    const business = {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: "Rose City Cafe",
      address: { "@type": "Place", addressLocality: "Portland" },
    };

    writePage(root, "index.html", page(`<script type="application/ld+json">${JSON.stringify(business)}</script>`));
    writeFileSync(path.join(root, "dist", "robots.txt"), "User-agent: *\nDisallow: /\n");

    const result = runScript(builtSiteScript, "preview", root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /address must use PostalAddress/);
  });
});

test("form-output checks find every enabled form outside the Contact route", () => {
  withOutput((root) => {
    const form = (id) => `<form method="post" class="contact-form" action="https://backstage.example.test/api/wa/forms/${id}" data-backstage-form="true"><fieldset class="contact-form__fields"><input name="name"></fieldset><button class="contact-form__submit" type="submit">Send</button></form>`;
    writePage(root, "private-events/index.html", page(form("private-events")));
    writePage(root, "catering/request/index.html", page(form("catering")));

    const valid = runScript(formOutputScript, "enabled", root);
    assert.equal(valid.status, 0, valid.stderr || valid.stdout);
    assert.match(valid.stdout, /2 forms across 2 pages/);

    writePage(root, "catering/request/index.html", page(form("catering").replace("https://backstage.example.test", "http://backstage.example.test")));
    const invalid = runScript(formOutputScript, "enabled", root);
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /must submit to an HTTPS endpoint/);
  });
});

test("form-output checks preserve disabled safety for every rendered form", () => {
  withOutput((root) => {
    const disabledForm = `<form class="contact-form"><p>Preview only. Form submissions are disabled.</p><fieldset class="contact-form__fields" disabled><input name="name"></fieldset><button class="contact-form__submit" type="button" disabled>Submissions disabled in preview</button></form>`;
    writePage(root, "private-events/index.html", page(disabledForm));
    writePage(root, "catering/request/index.html", page(disabledForm));

    const valid = runScript(formOutputScript, "disabled", root);
    assert.equal(valid.status, 0, valid.stderr || valid.stdout);
    assert.match(valid.stdout, /2 forms across 2 pages/);

    const unsafeForm = `<form class="contact-form" action="https://backstage.example.test/api/wa/forms/catering" method="post" data-backstage-form="true">${disabledForm.slice(disabledForm.indexOf(">") + 1, -"</form>".length)}</form>`;
    writePage(root, "catering/request/index.html", page(unsafeForm));
    const invalid = runScript(formOutputScript, "disabled", root);
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /must not expose submission configuration/);
  });
});
