# Agent and Developer Guidance

- CSS custom properties are the design-token source of truth. Tailwind utilities adapt semantic Theme Tokens; they do not define a parallel token system.
- Keep `brand.css` limited to portable identity colors and font-family stacks. It is code-managed until an explicit Backstage sync workflow is configured; never mutate it during normal development or builds.
- Keep semantic site choices in `theme.css`, shared interface mechanics in `ui.css`, and one-off styling with the relevant component.
- Prefer semantic Theme Tokens such as `bg-action`, `text-foreground`, and `font-heading` over literal brand values or legacy aliases.
- Font asset loading remains site-owned. Do not add a UI library or runtime Backstage request for theme tokens.
- Preserve the existing native CSS baseline when extending Tailwind; do not enable Preflight without reviewing its effect on current pages and blocks.
- Verify token or styling changes with `npm test`, `npm run check`, and `npm run build`.
