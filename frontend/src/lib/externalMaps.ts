/**
 * External navigation helpers for Explore Amritsar.
 *
 * Opens a destination in an external maps service using only verified data
 * (a real place name or coordinates returned by the booking API). Links are
 * opened only on explicit user action and never imply that a ride has been
 * booked. No private account information is included in the URL.
 */

/**
 * Build a Google Maps search URL. When coordinates are available they are used
 * (most precise); otherwise a properly encoded place-name query is used.
 * No coordinates are ever invented.
 */
export function buildExternalMapsUrl({
  name,
  lat,
  lng,
}: {
  name: string;
  lat?: number;
  lng?: number;
}): string {
  const query =
    lat != null && lng != null
      ? `${lat.toFixed(6)},${lng.toFixed(6)}`
      : name;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/**
 * Open the destination in an external maps service in a new tab.
 * Intended to be called from a user click handler only.
 */
export function openExternalMaps({
  name,
  lat,
  lng,
}: {
  name: string;
  lat?: number;
  lng?: number;
}): void {
  const url = buildExternalMapsUrl({ name, lat, lng });
  window.open(url, "_blank", "noopener,noreferrer");
}
