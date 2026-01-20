import { useState, useEffect } from 'react';

/**
 * Hook to detect if the current viewport is mobile-sized.
 * Uses window width with a configurable breakpoint (default 768px = md breakpoint).
 * 
 * @param breakpoint - Width threshold in pixels below which is considered mobile
 * @returns boolean indicating if viewport is mobile-sized
 */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < breakpoint;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };

    // Set initial value
    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [breakpoint]);

  return isMobile;
}
