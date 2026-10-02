import type { SiteContent } from "../lib/backstage/content";

const cafeImage =
  "https://images.unsplash.com/photo-1445116572660-236099ec97a0?auto=format&fit=crop&w=1800&q=85";
const tableImage =
  "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=85";

export const fixtureContent: SiteContent = {
  site: {
    name: "Fieldwork Coffee",
    domain: null,
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
    theme: {
      colors: {
        background: "#f5f7f3",
        foreground: "#17221d",
        mutedForeground: "#536158",
        accent: "#d9ef98",
        accentForeground: "#17221d",
        primary: "#294c3d",
        primaryForeground: "#ffffff",
        header: "#f5f7f3",
        headerForeground: "#17221d",
        topbar: "#17221d",
        topbarForeground: "#ffffff",
        footerLocation: "#294c3d",
        footerLocationForeground: "#ffffff",
        footer: "#17221d",
        footerForeground: "#ffffff",
        border: "#d9dfd8",
        surface: "#ffffff",
      },
      fonts: {
        body: 'Inter, "Avenir Next", Avenir, sans-serif',
        heading: 'Georgia, "Times New Roman", serif',
        navigation: 'Inter, "Avenir Next", Avenir, sans-serif',
      },
      fontStylesheets: [],
    },
    socialLinks: [],
    homeCta: null,
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
        {
          id: "fixture-home-events",
          type: "upcoming-events",
          fields: {
            eyebrow: "Around the table",
            title: "Coming up at Fieldwork.",
            description: "<p>Gather with neighbors over good food, thoughtful coffee, and an easy evening.</p>",
            count: 2,
          },
          events: [
            {
              id: "fixture-community-supper-event",
              slug: "community-supper",
              publicPath: "/events/community-supper/",
              title: "Community supper",
              startTime: "2027-04-10T18:00:00-05:00",
              endTime: null,
              timezone: "America/Chicago",
              shortDescription: "A seasonal dinner around the long table.",
              description: null,
              imageUrl: tableImage,
              imageAlt: "A dining room prepared for a shared dinner",
              ticketUrl: "https://events.example.test/community-supper",
            },
            {
              id: "fixture-sunday-coffee-event",
              slug: "sunday-coffee-tasting",
              publicPath: null,
              title: "Sunday coffee tasting",
              startTime: "2027-04-18T10:00:00-05:00",
              endTime: null,
              timezone: "America/Chicago",
              shortDescription: "Taste this month's featured single-origin coffee.",
              description: null,
              imageUrl: cafeImage,
              imageAlt: "Sunlight across a cafe table",
              ticketUrl: null,
            },
          ],
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
            image: [
              {
                url: cafeImage,
                alt: "A welcoming cafe interior in morning light",
              },
              {
                url: tableImage,
                alt: "A communal cafe table ready for guests",
              },
            ],
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
        {
          id: "fixture-about-image",
          type: "image",
          fields: {
            image: {
              url: cafeImage,
              alt: "A cafe counter with fresh coffee ready to serve",
            },
            caption: "Coffee, made thoughtfully and served with care.",
          },
        },
        {
          id: "fixture-about-media-text",
          type: "media-with-text",
          fields: {
            eyebrow: "A place to land",
            heading: "Stay for the conversation.",
            subheading: "Good coffee tastes better together.",
            body: "<p>Come in for a quick cup, meet a friend for a while, or settle into a quiet corner with something fresh from the oven.</p>",
            image: {
              url: tableImage,
              alt: "A warm cafe dining room with tables set for guests",
            },
            image_position: "right",
            section_width: "standard",
            cta_label: "Find your table",
            cta_url: "/about/",
          },
        },
        {
          id: "fixture-about-gallery",
          type: "image-gallery",
          fields: {
            eyebrow: "From the counter",
            heading: "A few everyday favorites.",
            columns: "3",
            images: [
              {
                image: { url: cafeImage, alt: "Cafe tables in morning light" },
                imageAlt: "Cafe tables in morning light",
                caption: "A slow start to the day.",
              },
              {
                image: { url: tableImage, alt: "A welcoming cafe dining room" },
                imageAlt: "A welcoming cafe dining room",
                caption: "Room to stay awhile.",
              },
            ],
          },
        },
        {
          id: "fixture-about-card-grid",
          type: "card-grid",
          fields: {
            eyebrow: "A place for every pace",
            heading: "Make room for a good day.",
            intro: "<p>Stop in for a quick cup, stay awhile, or bring someone new to the table.</p>",
            cards: [
              {
                title: "Coffee",
                body: "<p>Carefully sourced, simply prepared, and always ready to share.</p>",
                link_label: "Get to know us",
                link_url: "/about/",
              },
              {
                title: "From the oven",
                body: "<p>Small-batch bakes for slow mornings and afternoon breaks.</p>",
              },
              {
                title: "Our neighborhood",
                body: "<p>A welcoming place to meet, reset, and find your regular order.</p>",
                link_label: "See a community gathering",
                link_url: "/happenings/",
              },
            ],
          },
        },
        {
          id: "fixture-about-cta",
          type: "call-to-action",
          fields: {
            eyebrow: "Come on in",
            heading: "Your table is waiting.",
            body: "<p>Find us in the neighborhood and make your next coffee break count.</p>",
            button_label: "Plan your visit",
            button_url: "/about/",
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
  footerNavigation: [],
  menus: [
    {
      id: "fixture-menu",
      title: "All Day",
      slug: "all-day",
      subtitle: "Coffee, brunch, and something from the oven.",
      pdfUrl: null,
      categories: [
        {
          id: "fixture-coffee",
          title: "Coffee",
          order: null,
          subtitle: null,
          description: null,
          afterDescription: null,
          columns: null,
          items: [
            {
              id: "fixture-drip-coffee",
              title: "Slow drip coffee",
              subtitle: "Rotating single-origin beans",
              description: "<p>Bright, balanced, and brewed fresh throughout the morning.</p>",
              price: "3.50",
              prices: [{ label: "Small", value: "3.50" }, { label: "Large", value: "4.25" }],
              imageUrl: null,
              imageAlt: "",
              hiddenPrice: false,
            },
            {
              id: "fixture-cappuccino",
              title: "Cappuccino",
              subtitle: null,
              description: "<p>Double espresso with silky steamed milk.</p>",
              price: "4.50",
              prices: [{ label: "", value: "4.50" }],
              imageUrl: null,
              imageAlt: "",
              hiddenPrice: false,
            },
          ],
        },
      ],
    },
  ],
  locations: [],
  events: [],
  pressReleases: [
    {
      id: "fixture-press-community-supper",
      slug: "community-supper-in-the-neighborhood",
      title: "Fieldwork brings neighbors together around the table",
      source: "Fieldwork Coffee",
      sourceUrl: null,
      publishedAt: "2026-03-20T12:00:00.000Z",
      excerpt: "The neighborhood cafe is opening its long table for a seasonal supper and an evening of conversation.",
      content: "<p>Fieldwork Coffee will host its first community supper this spring, bringing neighbors together for a seasonal meal and a relaxed evening.</p>",
      imageUrl: tableImage,
      imageAlt: "A communal table set for dinner",
      featured: true,
    },
  ],
};
