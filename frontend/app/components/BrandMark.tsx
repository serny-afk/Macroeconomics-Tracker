/**
 * Brand mark: a tracking-dial — a ring with cardinal tick marks (gauge /
 * radar styling) and an off-center reading blip using the same teal -> brass
 * -> rust bloom as theme heat scores, so the logo reads as "instrument that
 * tracks a moving reading" rather than a static dot. This is the one
 * canonical mark — also used, unmodified, as app/icon.svg (the favicon).
 */
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="rgba(236, 232, 223, 0.38)" strokeWidth="1" />
      <g stroke="rgba(236, 232, 223, 0.38)" strokeWidth="1" strokeLinecap="round">
        <line x1="12" y1="1.5" x2="12" y2="3.4" />
        <line x1="12" y1="20.6" x2="12" y2="22.5" />
        <line x1="1.5" y1="12" x2="3.4" y2="12" />
        <line x1="20.6" y1="12" x2="22.5" y2="12" />
      </g>
      <circle cx="14.6" cy="9" r="3.6" fill="url(#brandBloom)" />
      <defs>
        <radialGradient id="brandBloom" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#57c2b0" />
          <stop offset="55%" stopColor="#c9a341" />
          <stop offset="100%" stopColor="#c8694a" />
        </radialGradient>
      </defs>
    </svg>
  );
}
