export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className="drop-shadow-md"
    >
      <circle cx="16" cy="16" r="14" fill="#0f172a" stroke="#ea580c" strokeWidth="1.25" />
      <path
        d="M10 10h4v4h-4zM10 14h8v4h-8zM14 10l4 4M18 10l-4 4"
        stroke="#ffffff"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.95"
      />
      <circle cx="22" cy="10" r="1.5" fill="#ea580c" />
    </svg>
  );
}

