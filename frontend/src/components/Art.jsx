// Original line-art illustrations for ICMS. Ink outlines + flat pool/blush/buoy fills.
// All strokes use currentColor so they flip correctly in dark mode.

const S = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" };
const SKY = "var(--color-sky)", BLUSH = "var(--color-blush)", BUOY = "var(--color-buoy)", PAPER = "var(--color-paper)";

/** The brand mark: a lifebuoy. `spin` turns it into a loader. */
export function Buoy({ size = 32, spin = false, className = "" }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={`${spin ? "spin-slow" : ""} ${className}`} aria-hidden="true">
      <circle cx="32" cy="32" r="26" fill={PAPER} />
      <g fill={BUOY}>
        <path d="M32 6a26 26 0 0 1 18.4 7.6L41.9 22.1A14 14 0 0 0 32 18z" />
        <path d="M58 32a26 26 0 0 1-7.6 18.4l-8.5-8.5A14 14 0 0 0 46 32z" />
        <path d="M32 58a26 26 0 0 1-18.4-7.6l8.5-8.5A14 14 0 0 0 32 46z" />
        <path d="M6 32a26 26 0 0 1 7.6-18.4l8.5 8.5A14 14 0 0 0 18 32z" />
      </g>
      <circle cx="32" cy="32" r="14" fill={SKY} stroke="currentColor" strokeWidth="3" />
      <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}

function Scooter({ x = 0, y = 0, s = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} {...S}>
      <path d="M22 78c2-20 20-28 44-26l34 2c9 1 13 8 13 16v8H22z" fill={BLUSH} />
      <path d="M46 50c3-9 34-9 38 0" fill={SKY} />
      <path d="M113 78c4-18 10-34 16-46" />
      <path d="M121 30l18-3" />
      <circle cx="131" cy="40" r="4" fill={PAPER} />
      <path d="M129 34l9 44" />
      <circle cx="40" cy="86" r="16" fill={PAPER} />
      <circle cx="40" cy="86" r="5" />
      <circle cx="140" cy="86" r="16" fill={PAPER} />
      <circle cx="140" cy="86" r="5" />
      <path d="M60 70h34" strokeDasharray="2 6" />
    </g>
  );
}

/** Login hero: a rider in the Bengaluru rain, scooter, lamp post with a lifebuoy, potted plant. */
export function RainScene({ className = "" }) {
  return (
    <svg viewBox="0 0 520 420" className={className} role="img" aria-label="A rider with an umbrella beside a scooter in the rain">
      <g {...S}>
        {/* rain */}
        {[[60, 30], [120, 70], [210, 20], [300, 60], [400, 26], [460, 90], [350, 120], [90, 140], [250, 110], [480, 170]].map(([x, y], i) => (
          <path key={i} d={`M${x} ${y}l-6 14`} strokeWidth="1.8" opacity=".55" />
        ))}
        {/* ground + puddle */}
        <path d="M20 372h480" />
        <ellipse cx="300" cy="384" rx="90" ry="9" fill={SKY} />
        {/* lamp post with lifebuoy */}
        <path d="M440 372V120" />
        <path d="M440 120c0-26 24-30 36-14" />
        <path d="M466 104l20 0-4 14h-12z" fill={PAPER} />
        <path d="M428 372h24" />
      </g>
      <g transform="translate(398 196)"><Buoy size={84} /></g>
      <g {...S}>
        <path d="M440 196v-8" />
        {/* plant */}
        <g transform="translate(-26 0)">
        <path d="M48 372l6-56h44l6 56z" fill={BLUSH} />
        <path d="M76 316c-2-40-16-70-34-86" />
        <path d="M76 300c6-36 22-60 44-72" />
        <path d="M42 230c20-2 30 14 28 32-18 2-30-12-28-32z" fill={SKY} />
        <path d="M120 228c-4 20-18 30-36 26 2-18 16-30 36-26z" fill={SKY} />
        <path d="M76 286c-22-6-36 4-40 22 20 6 34-4 40-22z" fill={PAPER} />
        </g>
      </g>
      {/* scooter */}
      <Scooter x={82} y={233} s={1.33} />
      <g {...S}>
        {/* rider: legs, kurta, arms, head with helmet */}
        <path d="M318 372l6-70M342 372l-4-70" />
        <path d="M310 372h18M334 372h18" />
        <path d="M302 304c2-46 8-74 30-80 22 6 28 34 30 80z" fill={SKY} />
        <path d="M312 240c-16 18-22 36-20 52" />
        <path d="M352 240c14 10 20 22 18 40" />
        <rect x="362" y="270" width="16" height="26" rx="3" fill={PAPER} />
        <circle cx="332" cy="202" r="18" fill={PAPER} />
        <path d="M313 200c0-16 9-26 19-26s20 10 20 26z" fill={BUOY} />
        <path d="M326 208h2M338 208h2" />
        {/* umbrella, held over the rider's head */}
        <path d="M352 244l-14-122" />
        <g transform="translate(64 -8)">
          <path d="M188 150c30-58 120-74 166-30-28-8-44 0-56 14-14-16-38-18-58-4-14-10-34-8-52 20z" fill={BLUSH} />
          <path d="M270 136c-4-10-2-20 2-26" />
        </g>
      </g>
    </svg>
  );
}

/** Small scene per policy type, used on picture cards. */
export function PolicyArt({ type, className = "" }) {
  if (type === "motor") {
    return (
      <svg viewBox="0 0 220 140" className={className} aria-hidden="true">
        <g {...S}><path d="M0 120h220" /><path d="M14 132h40M90 132h40M166 132h40" strokeDasharray="1 0" opacity=".5" /></g>
        <Scooter x={52} y={18} s={1} />
      </svg>
    );
  }
  if (type === "health") {
    return (
      <svg viewBox="0 0 220 140" className={className} aria-hidden="true">
        <g {...S}>
          <path d="M20 118h180" />
          <path d="M40 118V80h110v38" fill={PAPER} />
          <path d="M40 92h110" />
          <path d="M150 80c0-14 26-14 26 0v38" fill={SKY} />
          <path d="M52 80c0-10 22-10 22 0" fill={PAPER} />
          <path d="M100 26h20v14h14v20h-14v14h-20V60H86V40h14z" fill={BUOY} />
          <path d="M20 50h40l8-12 10 26 8-14h10" opacity=".6" />
          <path d="M66 118l-4 14M128 118l4 14" />
        </g>
      </svg>
    );
  }
  if (type === "property" || type === "home") {
    return (
      <svg viewBox="0 0 220 140" className={className} aria-hidden="true">
        <g {...S}>
          <path d="M20 124h180" />
          <path d="M60 124V72l50-36 50 36v52z" fill={PAPER} />
          <path d="M48 80l62-46 62 46" />
          <rect x="96" y="92" width="28" height="32" fill={BLUSH} />
          <rect x="70" y="80" width="18" height="16" fill={SKY} />
          <rect x="132" y="80" width="18" height="16" fill={SKY} />
          <path d="M44 34c16-30 64-34 84-6-14-4-24 0-30 8-8-8-22-10-32 0-8-4-16-4-22-2z" fill={SKY} />
          <path d="M86 32v-6" />
        </g>
      </svg>
    );
  }
  if (type === "travel") {
    return (
      <svg viewBox="0 0 220 140" className={className} aria-hidden="true">
        <g {...S}>
          <path d="M20 124h180" />
          <rect x="72" y="58" width="76" height="62" rx="10" fill={BLUSH} />
          <path d="M94 58V44h32v14" />
          <path d="M90 76v28M130 76v28" />
          <path d="M150 24l40 10-22 6 6 16-8 2-10-14-14 4z" fill={SKY} />
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 220 140" className={className} aria-hidden="true">
      <g {...S}>
        <path d="M20 124h180" />
        <path d="M110 30c-20 14-46 16-46 16v30c0 28 20 44 46 52 26-8 46-24 46-52V46s-26-2-46-16z" fill={SKY} />
        <path d="M94 78l12 12 22-24" />
      </g>
    </svg>
  );
}

/** Empty states: a sprig in a pot beside a folded form. */
export function EmptyArt({ className = "" }) {
  return (
    <svg viewBox="0 0 180 120" className={className} aria-hidden="true">
      <g {...S}>
        <path d="M10 108h160" />
        <path d="M40 108l4-32h28l4 32z" fill={BLUSH} />
        <path d="M58 76c0-20-8-34-20-42" />
        <path d="M58 70c4-18 14-28 26-32" />
        <path d="M36 34c12 0 18 10 16 20-12 0-18-10-16-20z" fill={SKY} />
        <path d="M86 36c-2 12-12 16-22 14 2-10 10-16 22-14z" fill={SKY} />
        <path d="M100 108V40h48l14 14v54" fill={PAPER} />
        <path d="M148 40v14h14" />
        <path d="M112 64h36M112 76h36M112 88h22" opacity=".6" />
      </g>
    </svg>
  );
}
