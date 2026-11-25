/* Neutral white-label wordmark. Theme-adaptive: the text uses currentColor so it
 * reads on both the pastel and dark grounds; the accent bar keeps the gradient. */
export default function BrandLogo({ height = 38 }: { height?: number }) {
  return (
    <svg
      viewBox="0 0 360 80"
      role="img"
      aria-label="Creator Intelligence"
      style={{ height, width: "auto", display: "block", color: "var(--ink)" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="brand-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ff7e9d" />
          <stop offset="0.4" stopColor="#e783bd" />
          <stop offset="1" stopColor="#9b8cff" />
        </linearGradient>
      </defs>
      <rect x="4" y="12" width="14" height="56" rx="7" fill="url(#brand-grad)" />
      <text x="32" y="42" fill="currentColor" fontFamily="Nunito, Quicksand, Arial, sans-serif" fontSize="30" fontWeight="800">Creator</text>
      <text x="32" y="70" fill="currentColor" opacity="0.6" fontFamily="Nunito, Quicksand, Arial, sans-serif" fontSize="20" fontWeight="600" letterSpacing="4">INTELLIGENCE</text>
    </svg>
  );
}
