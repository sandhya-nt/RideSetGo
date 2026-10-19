"use client";

import type { TouristPlace } from "@/types";

// Inline SVG illustrations per tourist category. Inline SVGs are used instead
// of external image URLs so there are no broken images, no unverified
// copyrighted assets, and no extra dependencies. Each illustration carries a
// descriptive <title> and role="img" aria-label as its accessible alternative
// text, and scales responsively with its container.

const CATEGORY_ILLUSTRATIONS: Record<string, () => JSX.Element> = {
  "religious-heritage": () => (
    <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <title>Religious and heritage site illustration</title>
      <rect width="120" height="120" rx="20" fill="#f1f5f9" />
      <path
        d="M30 90h60v-40H30z"
        fill="#fff"
        stroke="#cbd5e1"
        strokeWidth="2"
      />
      <path
        d="M60 20c-13 0-24 10-24 22v16h48V42c0-12-11-22-24-22Z"
        fill="#ea580c"
      />
      <path
        d="M48 42h24v8H48z"
        fill="#fff"
        stroke="#cbd5e1"
        strokeWidth="2"
      />
      <circle cx="60" cy="50" r="6" fill="#c2410c" />
    </svg>
  ),
  historical: () => (
    <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <title>Historical landmark illustration</title>
      <rect width="120" height="120" rx="20" fill="#f1f5f9" />
      <path
        d="M35 90h50v-30l-12-12H47l-12 12V90Z"
        fill="#fff"
        stroke="#cbd5e1"
        strokeWidth="2"
      />
      <path d="M60 42h10v8H60z" fill="#ea580c" />
      <rect x="44" y="72" width="8" height="14" fill="#cbd5e1" rx="2" />
      <rect x="68" y="72" width="8" height="14" fill="#cbd5e1" rx="2" />
      <path
        d="M35 90Q60 70 85 90"
        fill="none"
        stroke="#94a3b8"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ),
  museums: () => (
    <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <title>Museums and culture illustration</title>
      <rect width="120" height="120" rx="20" fill="#f1f5f9" />
      <path
        d="M30 90h60v-32H30z"
        fill="#fff"
        stroke="#cbd5e1"
        strokeWidth="2"
      />
      <path d="M45 58h8v6h-8z" fill="#ea580c" />
      <path d="M58 58h8v6h-8z" fill="#ea580c" />
      <path d="M71 58h8v6h-8z" fill="#ea580c" />
      <path d="M36 74h8v4h-8z" fill="#cbd5e1" />
      <path d="M52 74h8v4h-8z" fill="#cbd5e1" />
      <path d="M68 74h8v4h-8z" fill="#cbd5e1" />
      <path d="M84 74h8v4h-8z" fill="#cbd5e1" />
    </svg>
  ),
  markets: () => (
    <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <title>Markets and shopping illustration</title>
      <rect width="120" height="120" rx="20" fill="#f1f5f9" />
      <path
        d="M25 92h20v-20H25zM55 92h20v-26H55zM85 92h20v-14H85z"
        fill="#fff"
        stroke="#cbd5e1"
        strokeWidth="2"
      />
      <path d="M35 76h4v4h-4z" fill="#ea580c" />
      <path d="M63 82h4v4h-4z" fill="#ea580c" />
      <path d="M93 80h4v4h-4z" fill="#ea580c" />
      <path d="M42 92h4v4h-4z" fill="#94a3b8" />
      <path d="M72 92h4v4h-4z" fill="#94a3b8" />
      <path d="M102 92h4v4h-4z" fill="#94a3b8" />
    </svg>
  ),
  food: () => (
    <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <title>Food and local experiences illustration</title>
      <rect width="120" height="120" rx="20" fill="#f1f5f9" />
      <path
        d="M34 74c0-7 6-13 14-13s14 6 14 13"
        fill="#fff"
        stroke="#fdba74"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M48 74c0-5 4-9 10-9s10 4 10 9" fill="#fdba74" />
      <rect x="40" y="86" width="40" height="10" fill="#c2410c" rx="4" />
      <circle cx="48" cy="66" r="4" fill="#cbd5e1" />
      <circle cx="60" cy="68" r="3" fill="#e2e8f0" />
      <circle cx="72" cy="66" r="4" fill="#cbd5e1" />
    </svg>
  ),
  gardens: () => (
    <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <title>Gardens and family-friendly illustration</title>
      <rect width="120" height="120" rx="20" fill="#f1f5f9" />
      <path d="M60 52c-10 0-18 8-18 18h36c0-10-8-18-18-18Z" fill="#fff" />
      <path d="M60 36c-7 0-13 6-13 14h26c0-8-6-14-13-14Z" fill="#ea580c" />
      <path d="M42 86Q60 68 78 86T60 86Z" fill="#94a3b8" opacity="0.6" />
      <path d="M52 96h4v8h-4z" fill="#cbd5e1" />
      <path d="M64 96h4v8h-4z" fill="#cbd5e1" />
      <ellipse cx="60" cy="90" rx="22" ry="14" fill="#e2e8f0" opacity="0.6" />
    </svg>
  ),
};

export function PlaceIllustration({
  place,
  className = "w-full h-48 object-cover",
}: {
  place: TouristPlace;
  className?: string;
}) {
  const render = CATEGORY_ILLUSTRATIONS[place.category];
  const svg = render ? render() : CATEGORY_ILLUSTRATIONS["historical"]();

  return (
    <div className={`relative overflow-hidden rounded-3xl bg-rsgo-200 ${className}`}>
      {svg}
      <span className="absolute left-3 top-3 flex items-center gap-1 px-2 py-1 rounded-full bg-white/90 backdrop-blur text-xs font-medium text-rsgo-700 border border-gray-100">
        {place.source === "api" ? "Live location data" : "Static catalogue"}
      </span>
    </div>
  );
}
