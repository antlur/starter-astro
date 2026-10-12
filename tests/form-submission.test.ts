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
  assert.deepEqual(requests[0].init?.headers, {
    Accept: "application/json",
    "X-API-REQUEST": "true",
  });
  assert.equal(requests[0].init?.redirect, "manual");
  assert.ok(requests[0].init?.body instanceof FormData);
  assert.equal((requests[0].init?.body as FormData).get("name"), "Avery Guest");
  assert.equal((requests[0].init?.body as FormData).get("message"), "A table for four, please.");
});

test("accepts empty 201 and 204 success responses from Backstage", async () => {
  await assert.doesNotReject(() => submitBackstageForm(
    "https://backstage.example.test/api/wa/forms/form-1",
    createFormData(),
    async () => new Response(null, { status: 201 }),
  ));

  await assert.doesNotReject(() => submitBackstageForm(
    "https://backstage.example.test/api/wa/forms/form-1",
    createFormData(),
    async () => new Response(null, { status: 204 }),
  ));
});

test("accepts a JSON success response", async () => {
  await assert.doesNotReject(() => submitBackstageForm(
    "https://backstage.example.test/api/wa/forms/form-1",
    createFormData(),
    async () => Response.json({ message: "Form submitted." }),
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

test("fails on JSON rate-limit responses", async () => {
  await assert.rejects(
    () => submitBackstageForm(
      "https://backstage.example.test/api/wa/forms/form-1",
      createFormData(),
      async () => Response.json({ message: "Too many requests." }, { status: 429 }),
    ),
    { message: "Your message could not be sent. Please try again." },
  );
});

test("fails on redirects, including a followed redirect response", async () => {
  const followedRedirect = new Response("<html>Sign in</html>", {
    headers: { "content-type": "text/html" },
  });
  Object.defineProperty(followedRedirect, "redirected", { value: true });

  for (const response of [
    new Response(null, { status: 302, headers: { location: "https://backstage.example.test/login" } }),
    followedRedirect,
  ]) {
    await assert.rejects(
      () => submitBackstageForm(
        "https://backstage.example.test/api/wa/forms/form-1",
        createFormData(),
        async () => response,
      ),
      { message: "Your message could not be sent. Please try again." },
    );
  }
});

test("fails on unexpected successful response content", async () => {
  for (const response of [
    new Response("<html>Unexpected page</html>", {
      headers: { "content-type": "text/html" },
    }),
    new Response("{invalid json", {
      headers: { "content-type": "application/json" },
    }),
    new Response(null, { status: 200 }),
  ]) {
    await assert.rejects(
      () => submitBackstageForm(
        "https://backstage.example.test/api/wa/forms/form-1",
        createFormData(),
        async () => response,
      ),
      { message: "Your message could not be sent. Please try again." },
    );
  }
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

test("preserves upload FormData without setting a multipart content type", async () => {
  const data = createFormData();
  data.append("attachment", new Blob(["application payload"], { type: "application/pdf" }), "menu.pdf");
  let request: RequestInit | undefined;

  await submitBackstageForm(
    "https://backstage.example.test/api/wa/forms/form-1",
    data,
    async (_input, init) => {
      request = init;

      return new Response(null, { status: 201 });
    },
  );

  assert.ok(request?.body instanceof FormData);
  assert.equal(new Headers(request.headers).get("content-type"), null);
  const attachment = (request.body as FormData).get("attachment");
  assert.ok(attachment instanceof Blob);
  assert.equal((attachment as File).name, "menu.pdf");
  assert.equal(attachment.type, "application/pdf");
  assert.equal(await (attachment as File).text(), "application payload");
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
