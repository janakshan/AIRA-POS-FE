/**
 * Share in basis points → one-decimal percent, rounded half up. `(2145 / 100).toFixed(1)` gives
 * "21.4" (21.45 isn't exact in binary), so round in tenths of a percent on integers instead.
 */
export const sharePct = (bps: number) => (Math.round(bps / 10) / 10).toFixed(1);
