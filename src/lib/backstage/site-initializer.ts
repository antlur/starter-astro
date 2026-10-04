import { randomUUID } from "node:crypto";
import type { CreatePageParams, HeadlessPage, PageBlockWriteInput, Website } from "@antlur/backstage";

export type StarterSitePageStatus = "create" | "exists" | "route-conflict";

export interface StarterSitePageAction {
  path: string;
  title: string;
  status: StarterSitePageStatus;
  reason?: string;
  params?: CreatePageParams;
}

export interface StarterSitePagePlan {
  websiteId: string;
  actions: StarterSitePageAction[];
  warnings: string[];
  canApply: boolean;
}

type StarterWebsite = Pick<Website, "id" | "app_name">;

function normalizePath(value: string): string {
  const path = value.trim().split(/[?#]/, 1)[0];
  const segments = path.split("/").filter(Boolean);
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

function pagePath(page: Pick<HeadlessPage, "slug" | "pathname" | "is_home">): string {
  return page.is_home ? "/" : normalizePath(page.pathname || page.slug);
}

function block(type: string, data: Record<string, unknown>): PageBlockWriteInput {
  return { id: randomUUID(), type, data };
}

export function createStarterSitePages(
  website: StarterWebsite,
  contactFormId?: string,
): CreatePageParams[] {
  const name = website.app_name?.trim() || "your business";
  const pages: CreatePageParams[] = [
    {
      title: "Home",
      slug: "/",
      website_id: website.id,
      is_home: true,
      blocks: {
        blocks: [
          block("hero", {
            eyebrow: "Welcome",
            heading: `Welcome to ${name}`,
            body: "<p>Introduce your business and what visitors can find on this site.</p>",
            actions: [{ label: "Our story", href: "/about/" }],
          }),
          block("call-to-action", {
            heading: "Make this site yours",
            body: "<p>Replace these starter sections with your own copy, links, and imagery.</p>",
            button_label: "About us",
            button_url: "/about/",
          }),
        ],
      },
    },
    {
      title: "About",
      slug: "about",
      website_id: website.id,
      blocks: {
        blocks: [
          block("hero", { heading: "Our story" }),
          block("rich-text", {
            heading: `About ${name}`,
            body: "<p>Add your story, values, team details, and the information that matters to your visitors.</p>",
          }),
        ],
      },
    },
  ];

  if (contactFormId) {
    pages.push({
      title: "Contact",
      slug: "contact",
      website_id: website.id,
      blocks: {
        blocks: [block("contact-form", {
          heading: "Get in touch",
          form_id: contactFormId,
          submit_label: "Send message",
        })],
      },
    });
  }

  return pages;
}

export function planStarterSitePages(
  website: StarterWebsite,
  pages: HeadlessPage[],
  routes: string[],
  contactFormId?: string,
): StarterSitePagePlan {
  const existingPagePaths = new Set(pages.map(pagePath));
  const existingRoutes = new Set(routes.map(normalizePath));
  const definitions = createStarterSitePages(website, contactFormId);
  const actions = definitions.map((params): StarterSitePageAction => {
    const path = normalizePath(params.slug);
    if (existingPagePaths.has(path)) {
      return { path, title: params.title, status: "exists", reason: "An account page already owns this path." };
    }

    if (existingRoutes.has(path)) {
      return { path, title: params.title, status: "route-conflict", reason: "The route exists but no CMS page owns it; resolve the route before setup." };
    }

    return { path, title: params.title, status: "create", params };
  });
  const warnings = [
    "Curate page links in Backstage after setup; the available API cannot create navigation items or change website navigation settings.",
    "Page metadata and business branding remain manual. The page-create API does not accept SEO fields, and no media is invented.",
  ];

  if (!contactFormId) {
    warnings.push("Contact page was not created. Configure a form and its recipient in Backstage, then rerun with --contact-form-id and --confirm-contact-form-recipient.");
  }

  return {
    websiteId: website.id,
    actions,
    warnings,
    canApply: actions.every((action) => action.status !== "route-conflict"),
  };
}

export async function applyStarterSitePages(
  client: {
    pages: {
      createPage: (params: CreatePageParams) => Promise<unknown>;
      getHeadlessPages: () => Promise<HeadlessPage[]>;
    };
    website: { getWebsiteRoutes: (websiteId: string) => Promise<string[]> };
  },
  plan: StarterSitePagePlan,
): Promise<{ created: string[]; preserved: string[] }> {
  if (!plan.canApply) throw new Error("Starter pages were not created. Resolve route conflicts and rerun setup.");

  const created: string[] = [];
  const preserved: string[] = [];
  const [latestPages, latestRoutes] = await Promise.all([
    client.pages.getHeadlessPages(),
    client.website.getWebsiteRoutes(plan.websiteId),
  ]);
  const currentPagePaths = new Set(latestPages.map(pagePath));
  const currentRoutePaths = new Set(latestRoutes.map(normalizePath));

  for (const action of plan.actions) {
    if (action.status !== "create") continue;
    if (currentPagePaths.has(action.path)) {
      preserved.push(action.path);
      continue;
    }
    if (currentRoutePaths.has(action.path)) {
      throw new Error(`Starter page ${action.path} was not created because the route appeared after preflight.`);
    }
  }

  for (const action of plan.actions) {
    if (action.status === "exists") {
      preserved.push(action.path);
      continue;
    }
    if (currentPagePaths.has(action.path)) continue;

    if (!action.params) throw new Error(`Starter page ${action.path} has no create payload.`);
    await client.pages.createPage(action.params);
    created.push(action.path);
  }

  return { created, preserved };
}
