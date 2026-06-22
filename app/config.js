// Domain data — tuning constants and the menu tree. No DOM, no browser APIs.

export const CFG = {
  cooldownMs: 2500,        // gap before a spoken selection can fire again
  settleMs: 120,           // extra hold after a card highlights before it can be selected
  switchMs: 220,           // gaze must rest on a new card this long before the highlight moves (debounce)
  maxBlinkMs: 3000,        // longer closure = resting/sleeping, ignored
  faceLostMs: 700,         // grace before we declare tracking lost
  ease: 0.18,              // cursor glide damping toward the snapped card centre (lower = smoother/slower)
  medianN: 7,              // gaze samples in the median filter (higher = steadier but laggier)
};

// Two-level menu: fewer, bigger targets so low gaze accuracy still works.
// A node is a leaf (has `say`), a category (has `children`), or Back (has `back`).
export const TREE = [
  {e:'✅', t:'Yes',  say:'Yes'},
  {e:'❌', t:'No',   say:'No'},
  {e:'🍽️', t:'Food & Drink', children:[
    {e:'💧', t:'Water, please',      say:'Water, please'},
    {e:'🍔', t:"I'm hungry",         say:"I'm hungry"},
    {e:'☕', t:'Something to drink',  say:'I would like something to drink'},
    {e:'⬅️', t:'Back', back:true},
  ]},
  {e:'🩹', t:'Pain & Care', children:[
    {e:'😣', t:"I'm in pain",        say:"I'm in pain"},
    {e:'🚽', t:'I need the toilet',  say:'I need the toilet'},
    {e:'💊', t:'I need medication',  say:'I need my medication'},
    {e:'⬅️', t:'Back', back:true},
  ]},
];
