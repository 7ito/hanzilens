/**
 * Shared style utility functions.
 */

/**
 * Override the alpha channel of an `rgba(r, g, b, a)` color string.
 */
export function setAlpha(color: string, alpha: number): string {
  const match = color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)/);
  if (!match) return color;
  return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
}
