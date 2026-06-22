// Shared state store — the single mutable object the controller drives and the
// other layers read. Kept deliberately small and flat.

export const S = {
  tracking:false, fallback:false,
  cal:{open:0, closed:0, threshold:null, calibrating:false, samples:[]},
  blinkMinMs:500,
  rawX:innerWidth/2, rawY:innerHeight/2,                                   // unfiltered gaze (for bounds)
  gx:innerWidth/2, gy:innerHeight/2, cx:innerWidth/2, cy:innerHeight/2,    // filtered gaze + eased cursor
  gazeCard:null, gazeCardSince:0, candCard:null, candSince:0,              // magnetic-snap debounce
  armed:true, closedSince:null, blinkGazeCard:null,                        // blink state machine
  lastSelect:-1e9,
  faceLostSince:null,
  rafUi:null,
};
