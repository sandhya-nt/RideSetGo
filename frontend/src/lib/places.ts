/**
 * Explore Amritsar — static tourist catalogue.
 *
 * IMPORTANT: this file contains only STATIC, frontend-maintained catalogue
 * data. It is kept strictly separate from live API data returned by
 * GET /api/locations/ (name + coordinates only).
 *
 * Rules followed:
 * - Descriptions are short, factual statements only. No ratings, reviews,
 *   opening hours, ticket prices, travel times, or live visitor counts are
 *   included or implied, because none of that comes from the backend.
 * - Each live-API place is matched by name to a description here. Places
 *   returned by the API that have no catalogue entry are simply not shown in
 *   the tourist guide (we do not claim the API lists every Amritsar attraction).
 * - Gobindgarh Fort is a static-only entry: it is a well-known Amritsar
 *   attraction but it is NOT present in the booking API, so it has no
 *   coordinates and is NOT bookable. It is flagged source: "static" and
 *   bookable: false, and no coordinates are fabricated for it.
 */

import type { TouristCategory, TouristPlace } from "@/types";

/** Tourist category filters shown on the Explore page. */
export const TOURIST_CATEGORIES: TouristCategory[] = [
  { id: "religious-heritage", label: "Religious & Heritage" },
  { id: "historical", label: "Historical Landmarks" },
  { id: "museums", label: "Museums & Culture" },
  { id: "markets", label: "Markets & Shopping" },
  { id: "food", label: "Food & Local Experiences" },
  { id: "gardens", label: "Gardens & Family-Friendly" },
];

export const TOURIST_CATEGORY_BY_ID: Record<string, TouristCategory> =
  Object.fromEntries(TOURIST_CATEGORIES.map((c) => [c.id, c]));

/**
 * Short factual descriptions for live-API tourist places, keyed by place name.
 * These are catalogue text maintained in the frontend — they are NOT live data
 * and are labelled as such in the UI.
 */
export const LIVE_PLACE_DESCRIPTIONS: Record<
  string,
  { category: string; description: string }
> = {
  "Golden Temple": {
    category: "religious-heritage",
    description:
      "Holiest gurdwara of Sikhism, also known as Harmandir Sahib, at the centre of the Amrit Sarovar.",
  },
  "Jallianwala Bagh": {
    category: "historical",
    description:
      "Public garden and memorial marking the site of the 1919 Amritsar massacre.",
  },
  "Partition Museum": {
    category: "museums",
    description:
      "Museum dedicated to the stories, artefacts and memories of the 1947 Partition of India.",
  },
  "Durgiana Temple": {
    category: "religious-heritage",
    description:
      "Hindu temple dedicated to Goddess Durga, noted for its architecture echoing the Golden Temple.",
  },
  "Hall Bazaar": {
    category: "markets",
    description:
      "Historic shopping market in the heart of Amritsar, known for textiles, jewellery and handicrafts.",
  },
  "Wagah Border": {
    category: "historical",
    description:
      "India–Pakistan border crossing known for the daily Wagah–Attari border ceremony.",
  },
  "Attari Check Post": {
    category: "historical",
    description:
      "Land customs station on the India–Pakistan border near the Wagah ceremony area.",
  },
  "Company Bagh": {
    category: "gardens",
    description:
      "Historic garden (Ram Bagh) in Amritsar, laid out in the era of Maharaja Ranjit Singh.",
  },
  "Ram Tirath Temple": {
    category: "religious-heritage",
    description:
      "Ancient temple site associated with the Ramayana, believed to be the ashram of the sage Valmiki.",
  },
  "Summer Palace": {
    category: "museums",
    description:
      "Maharaja Ranjit Singh's summer palace, now a museum within the Ram Bagh garden.",
  },
  "Bharawan Da Dhaba": {
    category: "food",
    description:
      "Iconic Amritsari dhaba famous for chole bhature and lassi.",
  },
};

/**
 * Static-only catalogue entries that are NOT present in the booking API.
 * These are shown for discovery only. They have no verified coordinates from
 * the API, so they are not bookable and no "Plan a Ride" action is offered.
 */
export const STATIC_CATALOGUE_PLACES: TouristPlace[] = [
  {
    name: "Gobindgarh Fort",
    category: "historical",
    description:
      "Historic fort and museum complex in Amritsar. Not available for booking through the current RideSetGo location dataset.",
    source: "static",
    bookable: false,
  },
];

/**
 * Build the full explore catalogue from live API locations, enriched with
 * static descriptions where available, plus the static-only entries.
 *
 * - Live places keep the coordinates returned by /api/locations/.
 * - Only live places with a catalogue description are included as tourist
 *   destinations (the API contains many non-tourist points such as hospitals
 *   and colleges; we do not present them as tourist attractions).
 * - Results are deduplicated by name; static-only entries that also appear in
 *   the API are skipped to avoid duplicates.
 */
export function buildTouristCatalogue(
  liveLocations: { name: string; lat: number; lng: number }[],
): TouristPlace[] {
  const liveByName = new Map(
    liveLocations.map((l) => [l.name, { lat: l.lat, lng: l.lng }]),
  );
  const catalogue: TouristPlace[] = [];

  for (const [name, info] of Object.entries(LIVE_PLACE_DESCRIPTIONS)) {
    const coords = liveByName.get(name);
    if (!coords) {
      // Catalogue description exists but the place is not in the live API.
      // Skip rather than fabricate coordinates.
      continue;
    }
    catalogue.push({
      name,
      category: info.category,
      description: info.description,
      source: "api",
      lat: coords.lat,
      lng: coords.lng,
      bookable: true,
    });
  }

  // Append static-only entries that are not already represented by live data.
  const liveNames = new Set(liveLocations.map((l) => l.name));
  for (const place of STATIC_CATALOGUE_PLACES) {
    if (!liveNames.has(place.name)) {
      catalogue.push(place);
    }
  }

  // Stable, deterministic ordering: live places first (alphabetical), then
  // static-only entries (alphabetical). No duplicates by name.
  const seen = new Set<string>();
  const deduped: TouristPlace[] = [];
  const sorter = (a: TouristPlace, b: TouristPlace) => {
    if (a.source !== b.source) return a.source === "api" ? -1 : 1;
    return a.name.localeCompare(b.name);
  };
  for (const place of [...catalogue].sort(sorter)) {
    if (seen.has(place.name)) continue;
    seen.add(place.name);
    deduped.push(place);
  }
  return deduped;
}
