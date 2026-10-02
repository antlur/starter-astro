import sanitizeHtml from "sanitize-html";
import { previewRouteUrl } from "./safe-url";

const length = "(?:0|(?:\\d+(?:\\.\\d+)?)(?:px|rem|em|%))";
const spacing = new RegExp(`^(?:auto|-?${length})(?:\\s+(?:auto|-?${length})){0,3}$`, "i");
const color = "#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})";
const border = new RegExp(`^(?:none|0|${length}\\s+(?:solid|dashed|dotted)\\s+${color})$`, "i");
const allowImportant = (pattern: RegExp): RegExp =>
  new RegExp(`^(?:${pattern.source.replace(/^\^|\$$/g, "")})(?:\\s*!important)?$`, "i");
const lengthValue = allowImportant(new RegExp(`^-?${length}$`));
const marginValue = allowImportant(new RegExp(`^(?:auto|-?${length})$`));
const spacingValue = allowImportant(spacing);

export const sanitizeRichText = (
  value: string,
  preview?: { siteDomain: string | null; routePaths: readonly string[] },
  options: { preserveFirstH1?: boolean } = {},
): string => {
  let preservedFirstH1 = false;

  return sanitizeHtml(value, {
    allowedTags: [
      "p", "br", "strong", "b", "em", "i", "ul", "ol", "li", "a", "div", "hr",
      "h1", "h2", "h3", "h4", "h5", "h6",
    ],
    allowedAttributes: {
      a: ["href"],
      "*": ["style"],
    },
    allowedStyles: {
      "*": {
        "text-align": [allowImportant(/^(?:left|center|right|justify)$/i)],
        "font-size": [lengthValue],
        "font-weight": [allowImportant(/^(?:normal|bold|[1-9]00)$/i)],
        "font-style": [allowImportant(/^(?:normal|italic|oblique)$/i)],
        color: [allowImportant(new RegExp(`^${color}$`, "i"))],
        "line-height": [allowImportant(/^(?:\d+(?:\.\d+)?)(?:px|rem|em|%)?$/i)],
        margin: [spacingValue],
        "margin-top": [marginValue],
        "margin-right": [marginValue],
        "margin-bottom": [marginValue],
        "margin-left": [marginValue],
        "padding-left": [lengthValue],
        width: [lengthValue],
        "white-space": [allowImportant(/^(?:normal|nowrap|pre-wrap)$/i)],
        display: [allowImportant(/^(?:block|inline-block|flex|grid)$/i)],
        "grid-template-columns": [allowImportant(/^1fr(?:\s+1fr){0,2}$/i)],
        gap: [spacingValue],
        "column-gap": [lengthValue],
        border: [allowImportant(border)],
        "border-top": [allowImportant(border)],
      },
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    transformTags: {
      h1: (tagName, attributes) => {
        if (options.preserveFirstH1 && !preservedFirstH1) {
          preservedFirstH1 = true;
          return { tagName, attribs: attributes };
        }

        return { tagName: "h2", attribs: attributes };
      },
      ...(preview ? {
        a: (tagName: string, attributes: Record<string, string>) => {
          const href = previewRouteUrl(attributes.href, preview.siteDomain, preview.routePaths);
          return { tagName, attribs: href ? { ...attributes, href } : attributes };
        },
      } : {}),
    },
  });
};
