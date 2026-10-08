import assert from "node:assert/strict";
import test from "node:test";

import { isBackstageFormSubmissionEnabled } from "../src/lib/backstage/form-submission-policy";

test("keeps form submissions disabled in Astro development even when opted in", () => {
  assert.equal(isBackstageFormSubmissionEnabled({
    isDevelopment: true,
    isLegacyPreview: false,
    isEnabled: true,
  }), false);
});

test("keeps legacy migration preview submissions disabled", () => {
  assert.equal(isBackstageFormSubmissionEnabled({
    isDevelopment: false,
    isLegacyPreview: true,
    isEnabled: true,
  }), false);
});

test("keeps submissions disabled unless explicitly configured", () => {
  assert.equal(isBackstageFormSubmissionEnabled({
    isDevelopment: false,
    isLegacyPreview: false,
    isEnabled: false,
  }), false);
});

test("allows a configured production build", () => {
  assert.equal(isBackstageFormSubmissionEnabled({
    isDevelopment: false,
    isLegacyPreview: false,
    isEnabled: true,
  }), true);
});
