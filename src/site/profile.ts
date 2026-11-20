export function isRestaurantProfile(): boolean {
  const profile = process.env.BACKSTAGE_SITE_PROFILE?.trim();
  if (profile && profile !== "restaurant") {
    throw new Error('BACKSTAGE_SITE_PROFILE must be "restaurant" or unset.');
  }
  return profile === "restaurant";
}
