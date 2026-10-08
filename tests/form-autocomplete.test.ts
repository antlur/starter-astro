import assert from "node:assert/strict";
import test from "node:test";

import { formFieldAutocomplete } from "../src/lib/form-autocomplete";

const field = (name: string, label: string, type: "text" | "email" | "tel" | "url" = "text") => ({
  id: name,
  name,
  label,
  type,
  required: false,
  options: [],
});

test("uses explicit contact input types as autocomplete hints", () => {
  assert.equal(formFieldAutocomplete(field("reply_email", "Email address", "email")), "email");
  assert.equal(formFieldAutocomplete(field("phone_number", "Phone", "tel")), "tel");
  assert.equal(formFieldAutocomplete(field("website", "Website", "url")), "url");
});

test("recognizes common name and organization fields", () => {
  assert.equal(formFieldAutocomplete(field("first_name", "First name")), "given-name");
  assert.equal(formFieldAutocomplete(field("last_name", "Last name")), "family-name");
  assert.equal(formFieldAutocomplete(field("contact_name", "Your name")), "name");
  assert.equal(formFieldAutocomplete(field("company_name", "Company name")), "organization");
});

test("does not guess autocomplete values for unrelated form fields", () => {
  assert.equal(formFieldAutocomplete(field("message", "How can we help?")), undefined);
  assert.equal(formFieldAutocomplete(field("event_date", "Event date")), undefined);
});
