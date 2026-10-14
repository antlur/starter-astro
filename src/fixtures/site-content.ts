import { fixtureContent } from "./content";
import type { SiteContent } from "../lib/backstage/content";

export const fixtureSiteContent: SiteContent = {
  ...fixtureContent,
  routePaths: [
    ...fixtureContent.routePaths,
    "/contact",
    "/menu",
    "/menu/all-day",
    "/happenings",
    "/locations/fieldwork/community-supper",
    "/locations/fieldwork/seasonal-menu",
    "/events",
    "/events/community-supper",
    "/location",
    "/press",
    "/press/community-supper-in-the-neighborhood",
    "/__qa/rendered-blocks",
  ],
  navigation: [
    ...fixtureContent.navigation,
    { id: "fixture-contact-link", text: "Contact", url: "/contact/", newWindow: false, children: [] },
    {
      id: "fixture-menu-link",
      text: "Menu",
      url: "/menu/",
      newWindow: false,
      menuId: "fixture-menu",
      children: [{
        id: "fixture-menu-all-day-link",
        text: "All Day",
        url: "/menu/all-day/",
        newWindow: false,
        children: [{
          id: "fixture-menu-coffee-link",
          text: "Coffee",
          url: "/menu/all-day/#coffee",
          newWindow: false,
          children: [],
        }],
      }],
    },
    { id: "fixture-happenings-link", text: "Happenings", url: "/happenings/", newWindow: false, children: [] },
    { id: "fixture-press-link", text: "Press", url: "/press/", newWindow: false, children: [] },
    { id: "fixture-order-link", text: "Order online", url: "/menu/", newWindow: false, style: "button", children: [] },
  ],
  footerNavigation: [{
    id: "fixture-footer-visit-link",
    text: "Visit",
    url: "/locations/fieldwork/community-supper/",
    newWindow: false,
    children: [{
      id: "fixture-footer-events-link",
      text: "Happenings",
      url: "/happenings/",
      newWindow: false,
      children: [{
        id: "fixture-footer-event-link",
        text: "Community Supper",
        url: "/events/community-supper/",
        newWindow: false,
        children: [],
      }],
    }],
  }],
  alerts: [
    {
      id: "fixture-home-alert",
      title: "A note from the neighborhood",
      type: "info",
      is_global: false,
      published: true,
      pages: [],
      target_mode: "selected",
      targets: [{ type: "path", value: "/", label: "Home", path: "/", resolved: true }],
      start_at: null,
      end_at: null,
      media: null,
      content: "<p>Join us for a seasonal gathering around the table.</p>",
      cta_label: "See upcoming events",
      cta_url: "/events/",
      analytics_name: null,
      analytics_category: null,
      analytics_label: null,
      position: "top",
    },
    {
      id: "fixture-about-alert",
      title: "Planning a visit?",
      type: "popup",
      is_global: false,
      published: true,
      pages: [],
      target_mode: "selected",
      targets: [{ type: "path", value: "/about", label: "About", path: "/about/", resolved: true }],
      start_at: null,
      end_at: null,
      media: null,
      content: "<p>Explore the menu and find the right time to stop by.</p>",
      cta_label: "View the menu",
      cta_url: "/menu/",
      analytics_name: null,
      analytics_category: null,
      analytics_label: null,
      position: "bottom-right",
    },
  ],
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
      description: "<p>Gather with neighbors for a relaxed evening around the table.</p>",
      imageUrl: null,
      imageAlt: "",
      ticketUrl: "https://events.example.test/community-supper",
    },
  ],
  locations: [
    {
      id: "fixture-location",
      slug: "main-street",
      name: "Main Street",
      description: "<p>Join us in the neighborhood.</p>",
      addressLines: ["12 Market Street", "Chicago, IL 60601"],
      postalAddress: {
        streetAddress: "12 Market Street",
        addressLocality: "Chicago",
        addressRegion: "IL",
        postalCode: "60601",
      },
      phone: "(312) 555-0100",
      email: "hello@example.test",
      mapUrl: "https://maps.example.test/fieldwork",
      mapEmbedUrl: null,
      latitude: null,
      longitude: null,
      timezone: null,
      imageUrl: null,
      imageAlt: "",
      loyaltyUrl: null,
      hours: [
        { day: "Mon-Thu", value: "7 AM - 4 PM", order: 0 },
        { day: "Fri-Sat", value: "8 AM - 8 PM", order: 4 },
        { day: "Sun", value: "8 AM - 2 PM", order: 6 },
      ],
      openingHoursSpecification: [
        ...["Monday", "Tuesday", "Wednesday", "Thursday"].map((day) => ({
          dayOfWeek: `https://schema.org/${day}`,
          opens: "07:00",
          closes: "16:00",
        })),
        ...["Friday", "Saturday"].map((day) => ({
          dayOfWeek: `https://schema.org/${day}`,
          opens: "08:00",
          closes: "20:00",
        })),
        { dayOfWeek: "https://schema.org/Sunday", opens: "08:00", closes: "14:00" },
      ],
    },
  ],
  pages: [
    ...fixtureContent.pages,
    {
      id: "fixture-contact",
      title: "Contact Fieldwork Coffee",
      slug: "contact",
      pathname: "/contact",
      is_home: false,
      settings: {},
      layout: null,
      meta: {
        title: "Contact Fieldwork Coffee",
        description: "Get in touch with the Fieldwork Coffee team.",
      },
      blocks: [
        {
          id: "fixture-contact-form",
          type: "contact-form",
          fields: {
            eyebrow: "Say hello",
            heading: "We'd love to hear from you.",
            body: '<p>Send a note and our team will get back to you.</p>'
              + '<p><a href="/menu" data-type="button" class="inline-block px-4 py-2 bg-primary">View the menu</a></p>'
              + '<img src="/favicon.svg" alt="Fieldwork Coffee icon" class="attacker-class" style="position: fixed" width="64" height="64">',
            form_id: "fixture-contact-form",
            submit_label: "Send message",
          },
          form: {
            id: "fixture-contact-form",
            title: "Contact Fieldwork Coffee",
            action: "https://backstage.example.test/api/wa/forms/fixture-contact-form",
            recaptchaSiteKey: null,
            fields: [
              { id: "fixture-contact-name", name: "name", label: "Name", type: "text", required: true, options: [] },
              { id: "fixture-contact-email", name: "email", label: "Email", type: "email", required: true, options: [] },
              { id: "fixture-contact-message", name: "message", label: "Message", type: "textarea", required: true, options: [] },
            ],
          },
        },
      ],
    },
    {
      id: "fixture-rendered-block-coverage",
      title: "Rendered block QA",
      slug: "rendered-blocks",
      pathname: "/__qa/rendered-blocks",
      is_home: false,
      settings: {},
      layout: null,
      meta: {
        title: "Rendered block QA",
        description: "Internal fixture for rendered block coverage.",
      },
      blocks: [
        {
          id: "fixture-qa-empty-image-gallery",
          type: "image-gallery",
          fields: { heading: "Empty gallery heading must not render", images: [] },
        },
        {
          id: "fixture-qa-empty-rich-text-heading",
          type: "rich-text",
          fields: { body: "<h1> </h1>" },
        },
        {
          id: "fixture-qa-empty-image-link-grid",
          type: "image-link-grid",
          fields: { heading: "Empty links heading must not render", items: [] },
        },
        {
          id: "fixture-qa-video-hero",
          type: "video-hero",
          fields: {
            eyebrow: "Rendered fixture",
            heading: "A video hero rendered by Astro",
            body: "<p>Background motion stays decorative and can be paused.</p>",
            video: {
              url: "https://media.example.test/fieldwork-tour.mp4",
              file_name: "fieldwork-tour.mp4",
            },
            poster: {
              url: "https://images.example.test/fieldwork-tour-poster.jpg",
              alt: "",
            },
            actions: [{ label: "Explore the menu", href: "/menu/" }],
          },
        },
        {
          id: "fixture-qa-instagram-feed",
          type: "instagram-feed",
          fields: {
            eyebrow: "From the neighborhood",
            heading: "Fieldwork on Instagram",
            count: 2,
          },
          instagramUrl: "https://www.instagram.com/fieldworkcoffee/",
          instagramPosts: [
            {
              id: "fixture-qa-instagram-post-one",
              imageUrl: "https://images.example.test/instagram-morning-coffee.jpg",
              caption: "A bright start to the day.",
              permalink: "https://www.instagram.com/p/fixture-morning-coffee/",
              timestamp: null,
              mediaType: "IMAGE",
            },
            {
              id: "fixture-qa-instagram-post-two",
              imageUrl: "https://images.example.test/instagram-afternoon-table.jpg",
              caption: "Coffee, shared around the table.",
              permalink: "https://www.instagram.com/p/fixture-afternoon-table/",
              timestamp: null,
              mediaType: "IMAGE",
            },
          ],
        },
        {
          id: "fixture-qa-embedded-menu",
          type: "menu",
          fields: { menu_id: "fixture-menu" },
          menu: {
            ...fixtureContent.menus[0],
            pdfUrl: "https://files.example.test/menus/all-day-coffee.pdf",
          },
        },
        {
          id: "fixture-qa-rich-text-editor-output",
          type: "rich-text",
          fields: {
            body: '<p><a class="rich-text-link" href="/contact">Contact</a> '
              + '<a href="/contact" data-type="button" class="inline-block px-4 py-2 bg-primary text-primary-foreground rounded">Book now</a></p>'
              + "<blockquote><p>Gather around the table.</p></blockquote>"
              + "<p><u>Made with care.</u></p>"
              + '<img class="max-w-full h-auto rounded" style="max-width: 100%; height: auto;" '
              + 'src="/favicon.svg" alt="Fieldwork Coffee icon" title="Fieldwork Coffee" '
              + 'width="64" height="64" alignment="center">'
              + '<img src="/favicon.svg" alt="" width="16" height="16">',
          },
        },
      ],
    },
  ],
};
