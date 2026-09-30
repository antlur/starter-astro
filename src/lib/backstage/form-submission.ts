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
      headers: { "X-API-REQUEST": "true" },
    });
  } catch {
    throw new Error(networkErrorMessage);
  }

  if (response.ok) {
    return;
  }

  const payload: unknown = await response.json().catch(() => null);
  throw new Error(firstValidationError(payload) || fallbackMessage);
};
