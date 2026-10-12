const fallbackMessage = "Your message could not be sent. Please try again.";
const networkErrorMessage = "Your message could not be sent. Check your connection and try again.";

const firstValidationError = (payload: unknown): string | null => {
  if (typeof payload !== "object" || payload === null || !("errors" in payload)) {
    return null;
  }

  const errors = (payload as { errors?: unknown }).errors;

  if (typeof errors !== "object" || errors === null) {
    return null;
  }

  for (const messages of Object.values(errors)) {
    if (Array.isArray(messages) && typeof messages[0] === "string") {
      return messages[0];
    }
  }

  return null;
};

const parseJson = (content: string): { valid: boolean; value: unknown } => {
  try {
    return { valid: true, value: JSON.parse(content) as unknown };
  } catch {
    return { valid: false, value: null };
  }
};

const isJsonContentType = (contentType: string | null): boolean => {
  const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase();

  return mediaType === "application/json" || Boolean(mediaType?.endsWith("+json"));
};

export const submitBackstageForm = async (
  action: string,
  data: FormData,
  fetcher: typeof fetch = fetch,
): Promise<void> => {
  let response: Response;

  try {
    response = await fetcher(action, {
      method: "POST",
      body: data,
      headers: {
        Accept: "application/json",
        "X-API-REQUEST": "true",
      },
      redirect: "manual",
    });
  } catch {
    throw new Error(networkErrorMessage);
  }

  if (response.redirected || response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
    throw new Error(fallbackMessage);
  }

  let content: string;

  try {
    content = await response.text();
  } catch {
    throw new Error(fallbackMessage);
  }

  const empty = content.trim() === "";

  if (!response.ok) {
    const payload = parseJson(content).value;
    throw new Error(firstValidationError(payload) || fallbackMessage);
  }

  if (response.status === 204) {
    if (empty) {
      return;
    }

    throw new Error(fallbackMessage);
  }

  if (response.status === 201 && empty) {
    return;
  }

  if (empty || !isJsonContentType(response.headers.get("content-type")) || !parseJson(content).valid) {
    throw new Error(fallbackMessage);
  }
};
