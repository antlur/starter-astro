import type { FormDefinition } from "@antlur/backstage";
import type { BackstageFormDefinition, BackstageFormField, HeadlessPage } from "./content";
import { BACKSTAGE_REQUEST_CONCURRENCY, mapWithConcurrency } from "./concurrency";

interface FormDefinitionReader {
  forms: {
    getFormDefinition(formId: string, options?: RequestInit): Promise<FormDefinition>;
  };
}

const supportedFieldTypes = new Set<BackstageFormField["type"]>([
  "text",
  "email",
  "tel",
  "textarea",
  "date",
  "time",
  "number",
  "select",
  "checkbox",
  "radio",
  "file",
  "url",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const optionalString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

const snakeCase = (value: string): string =>
  value
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .replace(/\s+/g, "_")
    .toLowerCase()
    .replace(/^_+|_+$/g, "");

const normalizeOptions = (value: unknown, formId: string, label: string): BackstageFormField["options"] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((option, index) => {
    if (typeof option === "string" && option.trim() !== "") {
      return [{ label: option.trim(), value: option.trim() }];
    }

    if (!isRecord(option)) {
      throw new Error(`Backstage form ${formId} field ${label} has an invalid option at index ${index}.`);
    }

    const optionLabel = optionalString(option.label) ?? optionalString(option.value);
    const optionValue = optionalString(option.value) ?? optionLabel;

    if (!optionLabel || !optionValue) {
      throw new Error(`Backstage form ${formId} field ${label} has an invalid option at index ${index}.`);
    }

    return [{ label: optionLabel, value: optionValue }];
  });
};

export const normalizeFormDefinition = (value: unknown, expectedId: string): BackstageFormDefinition => {
  const payload = isRecord(value) && isRecord(value.data) ? value.data : value;

  if (!isRecord(payload) || typeof payload.id !== "string" || payload.id !== expectedId) {
    throw new Error(`Backstage did not return the selected form ${expectedId}.`);
  }

  const title = optionalString(payload.title);
  const action = optionalString(payload.action);

  if (!title || !action || !Array.isArray(payload.fields)) {
    throw new Error(`Backstage returned an incomplete definition for form ${expectedId}.`);
  }

  if (payload.fields.length === 0) {
    throw new Error(`Backstage form "${title}" has no configured fields. Add its fields in Backstage before using it on the site.`);
  }

  let actionUrl: URL | null = null;

  try {
    actionUrl = new URL(action);
  } catch {
    if (!action.startsWith("/") || action.startsWith("//")) {
      throw new Error(`Backstage form "${title}" has an invalid submission URL.`);
    }
  }

  if (actionUrl && actionUrl.protocol !== "http:" && actionUrl.protocol !== "https:") {
    throw new Error(`Backstage form "${title}" has an invalid submission URL.`);
  }

  const fields = payload.fields.map((field, index): BackstageFormField => {
    if (!isRecord(field)) {
      throw new Error(`Backstage form ${expectedId} has an invalid field at index ${index}.`);
    }

    const label = optionalString(field.label);
    const rawType = optionalString(field.type);
    const type = rawType === "phone" ? "tel"
      : rawType === "dropdown" ? "select"
        : rawType === "single-choice" ? "radio"
          : rawType === "multiple-choice" ? "checkbox"
            : rawType;

    if (!label || !type || !supportedFieldTypes.has(type as BackstageFormField["type"])) {
      throw new Error(`Backstage form ${expectedId} has an unsupported field at index ${index}.`);
    }

    const options = normalizeOptions(field.options, expectedId, label);

    if (["select", "checkbox", "radio"].includes(type) && options.length === 0) {
      throw new Error(`Backstage form "${title}" field ${label} needs at least one option.`);
    }

    return {
      id: optionalString(field.id) ?? String(index),
      name: optionalString(field.name) ?? snakeCase(label),
      label,
      type: type as BackstageFormField["type"],
      required: field.required === true,
      options,
    };
  });

  const names = fields.map((field) => field.name);

  if (names.some((name) => name === "") || new Set(names).size !== names.length) {
    throw new Error(`Backstage form "${title}" has an empty or duplicate field name.`);
  }

  return {
    id: payload.id,
    title,
    action,
    recaptchaSiteKey: optionalString(payload.recaptcha_site_key),
    fields,
  };
};

export const attachBackstageForms = async <T extends FormDefinitionReader>(
  pages: HeadlessPage[],
  client: T,
): Promise<HeadlessPage[]> => {
  const blocks = pages.flatMap((page) => page.blocks);
  const contactBlocks = blocks.filter((block) => block.type === "contact-form");
  const formIds = new Set<string>();

  for (const block of contactBlocks) {
    const formId = optionalString(block.fields.form_id);

    if (!formId) {
      throw new Error(`Contact Form block ${block.id} must select an existing Backstage form.`);
    }

    formIds.add(formId);
  }

  const definitions = new Map<string, BackstageFormDefinition>();

  await mapWithConcurrency(
    [...formIds],
    BACKSTAGE_REQUEST_CONCURRENCY,
    async (formId) => {
      const response = await client.forms.getFormDefinition(formId);
      definitions.set(formId, normalizeFormDefinition(response, formId));
    },
  );

  return pages.map((page) => ({
    ...page,
    blocks: page.blocks.map((block) => {
      if (block.type !== "contact-form") {
        return block;
      }

      const formId = optionalString(block.fields.form_id)!;

      return { ...block, form: definitions.get(formId)! };
    }),
  }));
};
