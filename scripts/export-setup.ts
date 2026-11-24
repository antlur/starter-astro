import { writeFileSync } from "node:fs";
import { serializeRestaurantSetupManifest } from "../src/lib/backstage/setup-manifest";

writeFileSync(new URL("../backstage.setup.json", import.meta.url), serializeRestaurantSetupManifest());
