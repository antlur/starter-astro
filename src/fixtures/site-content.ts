import { fixtureContent } from "./content";

export const fixtureSiteContent = {
  ...fixtureContent,
  routePaths: [...fixtureContent.routePaths, "/happenings", "/locations/fieldwork/community-supper"],
  navigation: [
    ...fixtureContent.navigation,
    { id: "fixture-happenings-link", text: "Happenings", url: "/happenings/", newWindow: false, children: [] },
  ],
};
