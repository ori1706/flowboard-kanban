/** Float positions — insert between neighbors without full re-numbering */
export function betweenPositions(before?: number | null, after?: number | null): number {
  if (before != null && after != null) {
    const mid = (before + after) / 2;
    if (Math.abs(before - after) < 1e-9) return before + 1e-6;
    return mid;
  }
  if (before != null) return before + 1000;
  if (after != null) return after - 1000;
  return 1000;
}
