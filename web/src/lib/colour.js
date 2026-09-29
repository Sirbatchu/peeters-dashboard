// Colour helpers shared by the calendar, notes and anything else that paints
// people's colours. Plain rgba() — the iPad's Safari 10 has no color-mix().

function rgb(hex) {
  var h = String(hex || '').replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length !== 6) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Dark or white text, whichever reads on this background (ITU-R BT.601). */
export function textOn(hex) {
  var c = rgb(hex);
  if (!c) return '#ffffff';
  return (c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000 > 150 ? '#1e293b' : '#ffffff';
}

/** The colour at low opacity, for tinted backgrounds. */
export function tint(hex, alpha) {
  var c = rgb(hex);
  if (!c) return 'rgba(148, 163, 184, ' + (alpha || 0.2) + ')';
  return 'rgba(' + c[0] + ', ' + c[1] + ', ' + c[2] + ', ' + (alpha || 0.2) + ')';
}
