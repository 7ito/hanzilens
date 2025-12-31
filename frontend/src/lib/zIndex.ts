/**
 * Simple z-index manager for bringing elements to front on click.
 * Uses a module-level counter that increments each time getNextZIndex() is called.
 */

let baseZIndex = 50; // Start above Tailwind's z-50

/**
 * Get the next z-index value, incrementing the counter.
 * Call this when a popup is clicked/focused to bring it to the front.
 */
export function getNextZIndex(): number {
  baseZIndex += 1;
  return baseZIndex;
}

/**
 * Get the current z-index without incrementing.
 * Useful for getting an initial z-index for new popups.
 */
export function getCurrentZIndex(): number {
  return baseZIndex;
}
