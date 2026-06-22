// Pure domain logic — no DOM, no globals, no side effects. Unit-testable in
// isolation and exercised by the ?selftest checks in main.js.

// Blink threshold sits partway between calibrated open and closed eyelid scores.
export function computeThreshold(open, closed){
  if (closed - open < 0.15) return null;           // not enough separation -> caller warns
  return open + 0.45 * (closed - open);
}

// A closed interval counts as a deliberate blink, not a flutter or a rest/sleep.
export function isDeliberateBlink(durMs, minMs, maxMs){
  return durMs >= minMs && durMs <= maxMs;
}

// Is a point inside a rect? Used to keep gaze selection within the board bounds.
export function pointInRect(x, y, r){
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

// Median of a list of numbers — drops outlier spikes where an average would smear them in.
export function median(nums){
  const s = [...nums].sort((a, b) => a - b);
  return s[s.length >> 1];
}
