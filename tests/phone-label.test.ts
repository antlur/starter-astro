import assert from "node:assert/strict";
import test from "node:test";
import { phoneLabel } from "../src/lib/phone-label";

test("formats plain North American phone labels without changing other labels", () => {
  assert.equal(phoneLabel("3125550134"), "(312) 555-0134");
  assert.equal(phoneLabel("+13125550134"), "+1 (312) 555-0134");
  assert.equal(phoneLabel("+442079460123"), "+442079460123");
  assert.equal(phoneLabel("312-555-0134 ext. 2"), "312-555-0134 ext. 2");
});
