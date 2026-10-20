// Small line icons, drawn for this game (24×24, currentColor).
const P: Record<string, string> = {
  coal: '<path d="M4 15l3-6 5-2 5 3 3 5-4 4H8z" fill="currentColor" opacity=".9"/><path d="M9 10l2 3m3-4l1 4" stroke="#0e141b" stroke-width="1.2"/>',
  wood: '<rect x="3" y="8" width="16" height="8" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="12" r="1" fill="currentColor"/>',
  steel: '<path d="M5 5h14M5 19h14M12 5v14" stroke="currentColor" stroke-width="3" stroke-linecap="square"/>',
  bricks: '<path d="M3 6h18v12H3zM3 12h18M9 6v6M15 12v6M7 12v0" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  food: '<path d="M12 4c4 0 7 4 7 8s-3 8-7 8-7-4-7-8 3-8 7-8z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="10" cy="10" r="1" fill="currentColor"/><circle cx="14" cy="14" r="1" fill="currentColor"/>',
  rations: '<path d="M4 11h16a8 8 0 01-16 0z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 7c0-2 2-2 2-4M14 7c0-2 2-2 2-4" stroke="currentColor" stroke-width="1.6" fill="none"/>',
  parts: '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" stroke="currentColor" stroke-width="2"/>',
  people: '<circle cx="9" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 20c0-4 3-6 6-6s6 2 6 6" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17" cy="9" r="2.4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16 14c3 0 5 2 5 5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  hope: '<path d="M12 3c1 4 6 6 6 11a6 6 0 01-12 0c0-3 2-4 2-7 2 1 3 3 3 5 1-2 1-6 1-9z" fill="currentColor"/>',
  disc: '<path d="M7 11V7a1.5 1.5 0 013 0v3-5a1.5 1.5 0 013 0v5-4a1.5 1.5 0 013 0v5-2a1.5 1.5 0 013 0v5c0 4-3 7-7 7s-6-2-7-5l-2-4c-.6-1.2 1-2.2 2-1.2l2 2z" fill="currentColor"/>',
  temp: '<path d="M10 4a2 2 0 014 0v10a4 4 0 11-4 0z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="17" r="2" fill="currentColor"/>',
  build: '<path d="M14 4l6 6-3 3-6-6zM11 7L3 15l3 3 8-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  boiler: '<circle cx="12" cy="13" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 13l4-3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M9 3h6" stroke="currentColor" stroke-width="2"/>',
  research: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M7 15h10" stroke="currentColor" stroke-width="1.6"/>',
  laws: '<path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 9h6M9 13h6" stroke="currentColor" stroke-width="1.8"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 4v14M15 6v14" stroke="currentColor" stroke-width="1.6"/>',
  pause: '<path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor"/>',
  play: '<path d="M7 5l11 7-11 7z" fill="currentColor"/>',
  fast: '<path d="M3 6l8 6-8 6zM12 6l8 6-8 6z" fill="currentColor"/>',
  faster: '<path d="M2 6l6 6-6 6zM9 6l6 6-6 6zM16 6l6 6-6 6z" fill="currentColor"/>',
  close: '<path d="M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
  heat: '<path d="M8 20c-3-3 0-6 0-9s-2-4-2-6M13 20c-3-3 0-6 0-9s-2-4-2-6M18 20c-3-3 0-6 0-9s-2-4-2-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  center: '<circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" stroke-width="2"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  sick: '<path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z" fill="currentColor"/>',
  skull: '<path d="M12 3a7 7 0 00-7 7c0 2.5 1.2 4 2 5v3h10v-3c.8-1 2-2.5 2-5a7 7 0 00-7-7z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9.5" cy="11" r="1.5" fill="currentColor"/><circle cx="14.5" cy="11" r="1.5" fill="currentColor"/>',
  home: '<path d="M3 11l9-7 9 7v9H3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  sound: '<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8a5 5 0 010 8M18.5 5.5a8.5 8.5 0 010 13" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  mute: '<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2"/>',
};

export function icon(name: string): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${P[name] ?? ''}</svg>`;
}
