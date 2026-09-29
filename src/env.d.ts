/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly BACKSTAGE_SOURCE?: "api" | "fixture";
  readonly BACKSTAGE_API_URL?: string;
  readonly BACKSTAGE_API_KEY?: string;
  readonly BACKSTAGE_ACCOUNT_ID?: string;
  readonly BACKSTAGE_NAVIGATION_ID?: string;
  readonly SITE_URL?: string;
  readonly SITE_INDEXABLE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
