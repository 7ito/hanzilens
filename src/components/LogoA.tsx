/**
 * Logo Option A: SVG lens with 字 (zì - character) inside
 * A magnifying glass design with the Chinese character for "character/word"
 */

interface LogoAProps {
  size?: number;
  className?: string;
}

export function LogoA({ size = 48, className = '' }: LogoAProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Gradient definitions */}
      <defs>
        <linearGradient id="lensGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--color-primary)" />
          <stop offset="100%" stopColor="var(--color-accent)" />
        </linearGradient>
        <linearGradient id="glassGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.1" />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.2" />
        </linearGradient>
      </defs>

      {/* Magnifying glass lens circle */}
      <circle
        cx="28"
        cy="28"
        r="22"
        stroke="url(#lensGradient)"
        strokeWidth="4"
        fill="url(#glassGradient)"
      />

      {/* Magnifying glass handle */}
      <line
        x1="44"
        y1="44"
        x2="58"
        y2="58"
        stroke="url(#lensGradient)"
        strokeWidth="5"
        strokeLinecap="round"
      />

      {/* Chinese character 字 (zì - character/word) */}
      <text
        x="28"
        y="34"
        textAnchor="middle"
        fontSize="22"
        fontWeight="600"
        fill="currentColor"
        className="text-foreground"
      >
        字
      </text>

      {/* Small shine/reflection on lens */}
      <circle
        cx="18"
        cy="18"
        r="4"
        fill="var(--color-primary)"
        opacity="0.3"
      />
    </svg>
  );
}
