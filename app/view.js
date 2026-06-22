// Presentation layer — every DOM read/write lives here. Holds no app logic and
// no state beyond what's needed to paint. The controller calls these to render.

const $ = id => document.getElementById(id);

export const els = {
  board:$('board'), crumb:$('crumb'), cursor:$('cursor'), ring:$('ring'),
  status:$('status'), toast:$('toast'), log:$('log'),
  cal:$('cal'), calMsg:$('calMsg'), calCount:$('calCount'), calDot:$('calDot'),
  camMount:$('camMount'),
  btnTrack:$('btnTrack'), btnRecal:$('btnRecal'), calSkip:$('calSkip'),
  blinkDur:$('blinkDur'), blinkVal:$('blinkVal'),
};

const ringProg = els.ring.querySelector('.prog');
const RING_C = 2 * Math.PI * 52;
ringProg.style.strokeDasharray = RING_C;

// Buttons currently on screen. Live binding: importers see the latest after renderBoard.
export let cards = [];

export function renderBoard(nodes, title, onActivate){
  els.board.replaceChildren();
  cards = nodes.map(node => {
    const b = document.createElement('button');
    b.className = 'card' + (node.children ? ' category' : '') + (node.back ? ' back' : '');
    b.type = 'button';
    b.setAttribute('aria-label', node.t);
    b.innerHTML = `<span class="emoji">${node.e}</span><span>${node.t}</span>`;
    b._node = node;
    b.addEventListener('click', () => onActivate(b, 'touch/click'));
    els.board.appendChild(b);
    return b;
  });
  els.crumb.textContent = title || 'Main board';
  return cards;
}

export function setStatus(msg, kind = 'muted'){ els.status.textContent = msg; els.status.className = kind; }
export function statusKind(){ return els.status.className; }

let toastT;
export function toast(msg){
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => els.toast.classList.remove('show'), 2200);
}

export function resetRing(){ els.ring.style.display = 'none'; ringProg.style.strokeDashoffset = RING_C; }
export function showRing(card, p){
  const r = card.getBoundingClientRect();
  els.ring.style.display = 'block';
  els.ring.style.left = (r.left + r.width / 2 - 60) + 'px';
  els.ring.style.top  = (r.top + r.height / 2 - 60) + 'px';
  ringProg.style.strokeDashoffset = RING_C * (1 - Math.min(1, p));
}

// Highlight the gazed card and move the cursor to (cx, cy); hide both when card is null.
export function paintGaze(card, cx, cy){
  cards.forEach(c => c.classList.toggle('gazed', c === card));
  els.cursor.style.opacity = card ? '1' : '0';
  if (card){ els.cursor.style.left = cx + 'px'; els.cursor.style.top = cy + 'px'; }
}
export function clearGaze(){ cards.forEach(c => c.classList.remove('gazed')); }
export function showCursor(on){ els.cursor.style.display = on ? 'block' : 'none'; }

export function logSelection(say, via){
  const li = document.createElement('li');
  const ts = new Date().toLocaleTimeString();
  li.innerHTML = `<span>${say}</span><time>${ts} · ${via}</time>`;
  els.log.prepend(li);
}
export function fireCard(card){ card.classList.add('fired'); setTimeout(() => card.classList.remove('fired'), 350); }

// Camera preview (mirror of the live stream) in the Status panel.
export function mountPreview(stream){
  const v = document.createElement('video');
  v.autoplay = true; v.muted = true; v.playsInline = true; v.srcObject = stream;
  v.play().catch(() => {});
  els.camMount.replaceChildren(v);
}
export function clearPreview(){ els.camMount.replaceChildren(); }

// Control affordances.
export function setTrackButton(text){ els.btnTrack.textContent = text; }
export function setTrackDisabled(d){ els.btnTrack.disabled = d; }
export function setRecalDisabled(d){ els.btnRecal.disabled = d; }
export function setBlinkLabel(v){ els.blinkVal.textContent = v; }

// Calibration overlay.
export function showCal(){ els.cal.style.display = 'flex'; }
export function hideCal(){ els.cal.style.display = 'none'; }
export function setCal(msg, count = ''){ els.calMsg.textContent = msg; els.calCount.textContent = count; }
export function moveCalDot(x, y){ els.calDot.style.left = x + 'px'; els.calDot.style.top = y + 'px'; els.calDot.style.display = 'block'; }
export function hideCalDot(){ els.calDot.style.display = 'none'; }
