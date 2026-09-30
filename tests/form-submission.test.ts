import assert from "node:assert/strict";
import test from "node:test";

import { submitBackstageForm } from "../src/lib/backstage/form-submission";

const createFormData = (): FormData => {
  const data = new FormData();
  data.append("name", "Avery Guest");
  data.append("message", "A table for four, please.");

  return data;
};

test("submits the form payload to Backstage using the public form request contract", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), init });

    return new Response(null, { status: 201 });
  };

  await submitBackstageForm("https://backstage.example.test/api/wa/forms/form-1", createFormData(), fetcher);

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://backstage.example.test/api/wa/forms/form-1");
  assert.equal(requests[0].init?.method, "POST");
  assert.deepEqual(requests[0].init?.headers, { "X-API-REQUEST": "true" });
  assert.ok(requests[0].init?.body instanceof FormData);
  assert.equal((requests[0].init?.body as FormData).get("name"), "Avery Guest");
  assert.equal((requests[0].init?.body as FormData).get("message"), "A table for four, please.");
});

test("accepts empty success responses from Backstage", async () => {
  await assert.doesNotReject(() => submitBackstageForm(
    "https://backstage.example.test/api/wa/forms/form-1",
    createFormData(),
    async () => new Response(null, { status: 204 }),
  ));
});

test("surfaces the first Backstage validation error", async () => {
  await assert.rejects(
    () => submitBackstageForm(
      "https://backstage.example.test/api/wa/forms/form-1",
      createFormData(),
      async () => Response.json({ errors: { "g-recaptcha-response": ["reCAPTCHA verification failed."] } }, { status: 422 }),
    ),
    { message: "reCAPTCHA verification failed." },
  );
});

test("uses a stable message for non-JSON HTTP errors", async () => {
  await assert.rejects(
    () => submitBackstageForm(
      "https://backstage.example.test/api/wa/forms/form-1",
      createFormData(),
      async () => new Response("Service unavailable", { status: 503 }),
    ),
    { message: "Your message could not be sent. Please try again." },
  );
});

test("uses a stable message when the request cannot reach Backstage", async () => {
  await assert.rejects(
    () => submitBackstageForm(
      "https://backstage.example.test/api/wa/forms/form-1",
      createFormData(),
      async () => {
        throw new TypeError("fetch failed");
      },
    ),
    { message: "Your message could not be sent. Check your connection and try again." },
  );
});
