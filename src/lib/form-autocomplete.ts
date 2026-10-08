import type { BackstageFormField } from "./backstage/content";

export const formFieldAutocomplete = (
  field: Pick<BackstageFormField, "type" | "name" | "label">,
): string | undefined => {
  if (field.type === "email" || field.type === "tel" || field.type === "url") return field.type;

  const identity = `${field.name} ${field.label}`.toLowerCase().replace(/[_-]+/g, " ");
  if (/\b(?:company|business|organization)\b/.test(identity)) return "organization";
  if (/\b(?:first|given)\s+name\b/.test(identity)) return "given-name";
  if (/\b(?:last|family)\s+name\b/.test(identity)) return "family-name";
  if (/\b(?:full|your|contact)?\s*name\b/.test(identity)) return "name";
  if (/\b(?:phone|telephone|mobile)\b/.test(identity)) return "tel";
  if (/\bemail\b/.test(identity)) return "email";
  if (/\bwebsite|web site|url\b/.test(identity)) return "url";

  return undefined;
};
