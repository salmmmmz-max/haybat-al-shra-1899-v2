/**
 * UI art: the Sadu weave (inline SVG patterns exposed as CSS variables) and the icon set (inline SVG strings).
 * Palette: madder red, soot black, sun-bleached ivory — the three wools of a real Sadu loom.
 */
const RED = '#8f2a1c', INK = '#1c120b', IVORY = '#f1e4c8';

/** main strip: a row of «عين» diamonds between «ضروس» teeth, edged by black and ivory selvedge lines (tile 48 × 20) */
const SADU =
  `<svg xmlns='http://www.w3.org/2000/svg' width='48' height='20' viewBox='0 0 48 20'>` +
  `<rect width='48' height='20' fill='${RED}'/>` +
  `<rect width='48' height='2.2' fill='${INK}'/><rect y='17.8' width='48' height='2.2' fill='${INK}'/>` +
  `<rect y='2.2' width='48' height='1' fill='${IVORY}'/><rect y='16.8' width='48' height='1' fill='${IVORY}'/>` +
  `<path d='M24 4.6L31 10L24 15.4L17 10Z' fill='${INK}'/><path d='M24 6.9L28 10L24 13.1L20 10Z' fill='${IVORY}'/>` +
  `<path d='M24 8.6L25.8 10L24 11.4L22.2 10Z' fill='${RED}'/>` +
  `<path d='M-6 3.2L6 3.2L0 8.2ZM42 3.2L54 3.2L48 8.2ZM-6 16.8L6 16.8L0 11.8ZM42 16.8L54 16.8L48 11.8Z' fill='${IVORY}'/>` +
  `<path d='M9 10l3-2.4l3 2.4l-3 2.4ZM33 10l3-2.4l3 2.4l-3 2.4Z' fill='${INK}'/></svg>`;

/** thin tooth rule (tile 16 × 8) */
const TEETH =
  `<svg xmlns='http://www.w3.org/2000/svg' width='16' height='8' viewBox='0 0 16 8'>` +
  `<rect width='16' height='8' fill='${RED}'/><path d='M0 8L4 0L8 8Z' fill='${INK}'/><path d='M8 0L12 8L16 0Z' fill='${IVORY}'/></svg>`;

const uri = svg => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

/** install the patterns as CSS variables (`--sadu`, `--sadu-teeth`) on the UI root */
export function installSadu(root) {
  root.style.setProperty('--sadu', uri(SADU));
  root.style.setProperty('--sadu-teeth', uri(TEETH));
}

const S = (body, vb = '0 0 24 24') => `<svg viewBox='${vb}' xmlns='http://www.w3.org/2000/svg'>${body}</svg>`;
const DIAMOND = `<path d='M12 1.5L21.5 12L12 22.5L2.5 12Z' fill='${INK}'/><path d='M12 5L18.3 12L12 19L5.7 12Z' fill='${RED}'/><path d='M12 8.6L15 12L12 15.4L9 12Z' fill='${IVORY}'/>`;

/** waterskin body (viewBox 32) — also used as the clip of its level */
const SKIN = 'M11 8.2C6.6 10.4 3.6 14.6 3.6 19.2C3.6 24.6 8.4 27.6 16 27.6S28.4 24.6 28.4 19.2C28.4 14.6 25.4 10.4 21 8.2C19.6 9.2 12.4 9.2 11 8.2Z';

export const ICONS = {
  eye: S(`<path d='M1.8 12c2.7-4.5 6.1-6.8 10.2-6.8s7.5 2.3 10.2 6.8c-2.7 4.5-6.1 6.8-10.2 6.8S4.5 16.5 1.8 12Z' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linejoin='round'/><circle cx='12' cy='12' r='3.6' fill='currentColor'/><circle cx='13.3' cy='10.7' r='1' fill='${INK}' opacity='.55'/>`),
  pause: S(`<rect x='6.2' y='5' width='4' height='14' rx='1' fill='currentColor'/><rect x='13.8' y='5' width='4' height='14' rx='1' fill='currentColor'/>`),
  /** قربة with a live level: `.lvl` rect is moved by the HUD (y 8 = full … 28 = empty) */
  skin: `<svg viewBox='0 0 32 32' xmlns='http://www.w3.org/2000/svg'><defs><clipPath id='hs-skin'><path d='${SKIN}'/></clipPath></defs>` +
    `<path d='${SKIN}' fill='#2a1a10' fill-opacity='.72'/>` +
    `<rect class='lvl' x='0' y='8' width='32' height='24' fill='#6fb6d8' clip-path='url(#hs-skin)'/>` +
    `<path d='${SKIN}' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linejoin='round'/>` +
    `<path d='M12.2 8.4L13 4.4h6l.8 4' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linejoin='round' stroke-linecap='round'/>` +
    `<path d='M11.4 6.2h9.2' stroke='currentColor' stroke-width='1.9' stroke-linecap='round'/>` +
    `<path d='M5.2 15.4c-2-.4-3 .6-3.4 2.4M26.8 15.4c2-.4 3 .6 3.4 2.4' fill='none' stroke='currentColor' stroke-width='1.5' stroke-linecap='round'/></svg>`,
  diamond: S(DIAMOND),
  goal: S(DIAMOND),
  suhail: S(`<path d='M12 1.5L14.2 9.8L22.5 12L14.2 14.2L12 22.5L9.8 14.2L1.5 12L9.8 9.8Z' fill='#ffd76a' stroke='${INK}' stroke-width='1' stroke-linejoin='round'/>`),
  jady: S(`<path d='M12 1L13.9 8.3L19.8 4.2L15.7 10.1L23 12L15.7 13.9L19.8 19.8L13.9 15.7L12 23L10.1 15.7L4.2 19.8L8.3 13.9L1 12L8.3 10.1L4.2 4.2L10.1 8.3Z' fill='#dff0ff' stroke='${INK}' stroke-width='1' stroke-linejoin='round'/>`),
  sun: S(`<circle cx='12' cy='12' r='4.6' fill='#ffcf5c' stroke='${INK}' stroke-width='1'/><path d='M12 1.6v3.4M12 19v3.4M1.6 12H5M19 12h3.4M4.6 4.6l2.4 2.4M17 17l2.4 2.4M19.4 4.6L17 7M7 17l-2.4 2.4' stroke='#ffcf5c' stroke-width='2' stroke-linecap='round'/>`),
  camp: S(`<path d='M12 3.2L22.4 20.6H1.6Z' fill='${IVORY}' stroke='${INK}' stroke-width='1.2' stroke-linejoin='round'/><path d='M12 9.5L16.2 20.6H7.8Z' fill='${INK}'/><path d='M10.6 1.6L12 3.6L13.4 1.6' fill='none' stroke='${INK}' stroke-width='1.2' stroke-linecap='round'/>`),
  voice: S(`<circle cx='6' cy='12' r='2.6' fill='${IVORY}' stroke='${INK}' stroke-width='1'/><path d='M11 7.2c2.2 2.9 2.2 6.7 0 9.6M15 4.4c3.8 4.6 3.8 10.6 0 15.2M19 2c5 6 5 14 0 20' fill='none' stroke='${IVORY}' stroke-width='1.9' stroke-linecap='round'/>`),
  lock: S(`<rect x='5' y='10.5' width='14' height='10' rx='2' fill='currentColor'/><path d='M8 10.5V8a4 4 0 0 1 8 0v2.5' fill='none' stroke='currentColor' stroke-width='2'/>`),
  next: S(`<path d='M15 5L7 12L15 19Z' fill='currentColor'/>`),
  back: S(`<path d='M9 5L17 12L9 19' fill='none' stroke='currentColor' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'/>`),
  arrow: S(`<path d='M12 2L20 13H15V22H9V13H4Z' fill='currentColor'/>`),
  check: S(`<path d='M4.5 12.5L10 18L19.5 6.5' fill='none' stroke='currentColor' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'/>`),
  phone: S(`<rect x='7' y='2.5' width='10' height='19' rx='2.2' fill='none' stroke='currentColor' stroke-width='1.7'/><circle cx='12' cy='18.4' r='.9' fill='currentColor'/>`),
  /** tutorial glyph parts */
  thumb: S(`<circle cx='12' cy='12' r='9.4' fill='none' stroke='currentColor' stroke-width='1.6' opacity='.7'/><circle class='dot' cx='12' cy='12' r='4.2' fill='currentColor'/>`),
  swipe: S(`<path d='M3 12h18M7 8l-4 4l4 4M17 8l4 4l-4 4' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round' opacity='.7'/><circle class='dot' cx='12' cy='12' r='3.6' fill='currentColor'/>`),
  hold: S(`<circle cx='12' cy='12' r='9.4' fill='none' stroke='currentColor' stroke-width='1.6' opacity='.45'/><circle class='arc' cx='12' cy='12' r='9.4' fill='none' stroke='currentColor' stroke-width='2.4' stroke-linecap='round' stroke-dasharray='59' stroke-dashoffset='59' transform='rotate(-90 12 12)'/><circle cx='12' cy='12' r='4.2' fill='currentColor'/>`),
  tap: S(`<circle class='pulse' cx='12' cy='12' r='9.4' fill='none' stroke='currentColor' stroke-width='1.6'/><circle cx='12' cy='12' r='4.2' fill='currentColor'/>`),
};

/** speaker accent colours (name plate) by character id */
export const SPEAKER = {
  dhari: '#27406b', mani: '#5b3a22', misfer: '#6d5a2f', moudi: '#1c1a1f', fuhaid: '#2f6d7a',
  jaber: '#33407c', thamer: '#6b1f16', rider: '#4a2a1c',
};
