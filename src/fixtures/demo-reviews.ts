const fixtures = {
  "fat-nickys-demo": {
    domain: "fat-nickys.example",
    reviews: [
      { quote: "We grabbed a booth after work, ordered the Riverfront White Pie, and stayed long after the last square was gone.", location: "Riverfront" },
      { quote: "The hot pepperoni is the move. Thin enough to crackle, with just enough giardiniera to make you reach for another bite.", location: "Market Street" },
      { quote: "We brought the whole family on Friday. Next time we're getting two orders of garlic knots from the start.", location: "Riverfront" },
      { quote: "A couple of squares at the counter turned into a pie to take home. The edge is the best part.", location: "Market Street" },
      { quote: "A booth, a cold drink, and a pizza cut into squares. Exactly what we wanted out of a night in the neighborhood.", location: "Riverfront" },
      { quote: "We split a tavern pie after the market. Next time I'll order the hot giardiniera on the side so I don't have to share it.", location: "Market Street" },
    ],
  },
  "franklin-perk-demo": {
    domain: "franklin-perk.example",
    reviews: [
      { quote: "I came in for an oat latte and ended up staying for a second cup and a few more chapters." },
      { quote: "The breakfast sandwich is worth slowing down for. Get it with a drip coffee and grab a seat by the window." },
      { quote: "We split a pastry on our Saturday walk. By the time we got to the corner, we were talking about going back for another." },
      { quote: "It's the kind of coffee shop where a quick catch-up turns into an hour. We always end up back at the same table." },
    ],
  },
} as const;

export const resolveDemoReviews = (target: string | undefined, indexable: string | undefined, source: string | undefined, domain: string | null) => {
  if (!target) return [];
  if (target !== "fat-nickys-demo" && target !== "franklin-perk-demo") {
    throw new Error("SITE_DEMO_REVIEWS must name a supported Starter demo.");
  }
  if (indexable !== "false") {
    throw new Error("Starter review fixtures require SITE_INDEXABLE=false.");
  }
  const fixture = fixtures[target];
  if (source !== "fixture" && (source !== "api" || domain !== fixture.domain)) {
    throw new Error("SITE_DEMO_REVIEWS must match the configured demo website.");
  }
  return fixture.reviews;
};
