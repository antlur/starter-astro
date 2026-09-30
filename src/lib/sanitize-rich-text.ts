import sanitizeHtml from "sanitize-html";

export const sanitizeRichText = (value: string): string =>
  sanitizeHtml(value, {
    allowedTags: ["p", "br", "strong", "b", "em", "i", "ul", "ol", "li", "a"],
    allowedAttributes: {
      a: ["href"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
  });
