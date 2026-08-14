/**
 * Garden leaf mark — the auth screens' logo.
 *
 * Why: Julian's direction (Aug 2026 login redesign) — the door to Garden is
 * marked with a leaf rather than the app's 8-pointed asterisk. Drawn in the
 * same thin moss-ink line language as the login foliage bed
 * (login-foliage.tsx): stroked blade, curved midrib, three side veins, soft
 * brand-tinted fill. Rides `currentColor` so it themes with moss/sage
 * automatically.
 */
export function LeafMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
    >
      {/* Blade — tip top-right, base at lower-left where the stem meets it */}
      <path
        d="M19.5 4.5 C13 4.5 7.5 8 6.2 14 C5.6 16.7 6.3 18.9 6.9 19.8 C9.5 20.2 12.4 19.6 14.8 17.8 C18.4 15 19.8 9.8 19.5 4.5 Z"
        fill="currentColor"
        fillOpacity="0.12"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      {/* Midrib */}
      <path
        d="M7 19.6 C9 13.8 12.8 9 18.2 5.8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      {/* Side veins */}
      <path
        d="M9.4 15.2 C10.8 15.4 12.4 15.1 13.7 14.3 M11.6 11.6 C13 11.8 14.6 11.5 15.9 10.7 M14.2 8.6 C15.3 8.8 16.6 8.6 17.7 8"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeOpacity="0.55"
      />
      {/* Stem */}
      <path
        d="M6.9 19.8 C5.9 20.9 5.3 21.9 5 22.8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}
