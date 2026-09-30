import type { SiteContent } from "../lib/backstage/content";

const cafeImage =
  "https://images.unsplash.com/photo-1445116572660-236099ec97a0?auto=format&fit=crop&w=1800&q=85";

export const fixtureContent: SiteContent = {
  site: {
    name: "Fieldwork Coffee",
    meta: {
      title: "Fieldwork Coffee",
      description: "Thoughtful coffee, baked fresh, and a good place to land.",
    },
    openGraph: {
      title: "Fieldwork Coffee",
      description: "Thoughtful coffee, baked fresh, and a good place to land.",
      image: cafeImage,
    },
    logo: null,
    faviconUrl: null,
    appleIconUrl: null,
  },
  pages: [
    {
      id: "fixture-home",
      title: "Coffee for the everyday",
      slug: "/",
      pathname: "/",
      is_home: true,
      settings: {},
      layout: null,
      meta: {
        title: "Coffee for the everyday",
        description: "A neighborhood coffee shop with carefully sourced coffee and a generous welcome.",
      },
      blocks: [
        {
          id: "fixture-home-hero",
          type: "hero",
          variant: "default",
          fields: {
            eyebrow: "Your neighborhood, well brewed",
            heading: "Coffee for the everyday.",
            body: "<p>Carefully sourced coffee, something good from the oven, and room to stay a while.</p>",
            image: {
              url: cafeImage,
              alt: "Sunlit neighborhood cafe with tables ready for the morning",
            },
            actions: [{ label: "Find your table", href: "/about/" }],
          },
        },
      ],
    },
    {
      id: "fixture-about",
      title: "A little more about us",
      slug: "about",
      pathname: "/about",
      is_home: false,
      settings: {},
      layout: {
        id: "fixture-standard-page-layout",
        name: "Starter Astro Standard Page",
        slug: "starter-astro-standard-page",
        schema: { fields: [] },
        data: { content_width: "narrow", section_spacing: "comfortable" },
      },
      meta: {
        title: "About Fieldwork Coffee",
        description: "Get to know the people, coffee, and care behind Fieldwork Coffee.",
      },
      blocks: [
        {
          id: "fixture-about-hero",
          type: "hero",
          variant: "full-bleed-image",
          fields: {
            eyebrow: "The good stuff takes care",
            heading: "A neighborhood place, made with intention.",
            body: "<p>We believe the best coffee shops make the everyday feel a little more considered.</p>",
            image: {
              url: cafeImage,
              alt: "A welcoming cafe interior in morning light",
            },
            actions: [{ label: "Back home", href: "/" }],
          },
        },
        {
          id: "fixture-about-content",
          type: "rich-text",
          fields: {
            eyebrow: "Our approach",
            heading: "Good coffee starts with good choices.",
            body: "<p>We work with growers and makers who care about the details, then bring those details to the neighborhood.</p>",
          },
        },
      ],
    },
  ],
  routePaths: ["/", "/about"],
  navigation: [
    { id: "fixture-home-link", text: "Home", url: "/", newWindow: false, children: [] },
    { id: "fixture-about-link", text: "About", url: "/about/", newWindow: false, children: [] },
  ],
};
