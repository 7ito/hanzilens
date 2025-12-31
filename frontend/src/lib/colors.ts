/**
 * Color utilities for translation alignment highlighting
 */

/**
 * Curated palette of 10 distinct colors for highlighting
 * Each color has light and dark mode variants with appropriate contrast
 */
const HIGHLIGHT_PALETTE = {
  light: [
    'rgba(239, 68, 68, 0.25)',   // red
    'rgba(249, 115, 22, 0.25)',  // orange
    'rgba(234, 179, 8, 0.25)',   // yellow
    'rgba(34, 197, 94, 0.25)',   // green
    'rgba(6, 182, 212, 0.25)',   // cyan
    'rgba(59, 130, 246, 0.25)',  // blue
    'rgba(139, 92, 246, 0.25)',  // violet
    'rgba(236, 72, 153, 0.25)',  // pink
    'rgba(168, 85, 247, 0.25)',  // purple
    'rgba(20, 184, 166, 0.25)',  // teal
  ],
  dark: [
    'rgba(239, 68, 68, 0.35)',   // red
    'rgba(249, 115, 22, 0.35)',  // orange
    'rgba(234, 179, 8, 0.35)',   // yellow
    'rgba(34, 197, 94, 0.35)',   // green
    'rgba(6, 182, 212, 0.35)',   // cyan
    'rgba(59, 130, 246, 0.35)',  // blue
    'rgba(139, 92, 246, 0.35)',  // violet
    'rgba(236, 72, 153, 0.35)',  // pink
    'rgba(168, 85, 247, 0.35)',  // purple
    'rgba(20, 184, 166, 0.35)',  // teal
  ],
} as const;

/**
 * Get a highlight color for a given segment index
 * Colors cycle through the palette
 */
export function getHighlightColor(index: number, isDark: boolean): string {
  const palette = isDark ? HIGHLIGHT_PALETTE.dark : HIGHLIGHT_PALETTE.light;
  return palette[index % palette.length];
}

/**
 * Generate an array of highlight colors for all segments
 */
export function generateHighlightColors(count: number, isDark: boolean): string[] {
  return Array.from({ length: count }, (_, i) => getHighlightColor(i, isDark));
}

/**
 * Get the total number of colors in the palette
 */
export function getPaletteSize(): number {
  return HIGHLIGHT_PALETTE.light.length;
}
