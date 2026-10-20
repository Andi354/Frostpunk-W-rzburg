import { SITES, type SiteDef } from '../../sim/data/sites';
import { RESOURCE_NAMES, type ResourceId } from '../../sim/types';
import { canSend, send } from '../../sim/explore';
import { dayOf } from '../../sim/weather';
import { ACTIONS, BAR, PANELS, esc, fmt, hhmm, type App } from '../app';
import { icon } from '../icons';

const SITE_LIST = Object.values(SITES);

/** A smooth line through the points (Catmull-Rom as cubic Béziers). */
function smooth(pts: [number, number][]): string {
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${p2[0]} ${p2[1]}`;
  }
  return d;
}

const MAIN_CITY: [number, number][] = [
  [44, 0],
  [40, 16],
  [37, 32],
  [40, 46],
  [45, 56],
  [41, 70],
  [37, 86],
  [38, 100],
];
/** Main from Lohr to Schweinfurt, through Würzburg (regional map). */
const MAIN_REGION: [number, number][] = [
  [12, 30],
  [34, 30],
  [50, 55],
  [62, 82],
  [70, 66],
  [78, 22],
];

const label = (x: number, y: number, text: string, cls = 'map-label') =>
  `<text x="${x}" y="${y}" text-anchor="middle" class="${cls}">${esc(text)}</text>`;

/** Marker state: explored ✓, underway (pulsing), locked (prerequisite missing), or open. */
function markerState(app: App, site: SiteDef): 'explored' | 'underway' | 'locked' | 'open' {
  const s = app.s;
  if (s.explored.includes(site.id)) return 'explored';
  if (s.expeditions.some((e) => e.site === site.id)) return 'underway';
  const why = canSend(s, site.id);
  return why?.startsWith('Erst') ? 'locked' : 'open';
}

const LABEL_ABOVE = new Set(['ferdinandeum']);

function marker(app: App, site: SiteDef): string {
  const st = markerState(app, site);
  const selected = app.sheet?.arg === site.id;
  const style = {
    explored: 'fill:var(--good);stroke:var(--good)',
    underway: 'fill:var(--ink);stroke:var(--ember)',
    locked: 'fill:var(--ink-3);stroke:var(--line)',
    open: 'fill:var(--ink);stroke:var(--brass)',
  }[st];
  const cls = st === 'underway' ? ' class="site-underway"' : '';
  const name = site.name.split(' · ')[0];
  // labels that would run into a neighbouring marker sit above their own
  const labelY = site.y + (LABEL_ABOVE.has(site.id) ? -4.2 : 6.2);
  const mark = st === 'explored' ? `<text x="${site.x}" y="${site.y + 1.2}" text-anchor="middle" class="map-check">✓</text>` : '';
  return `<g role="button" tabindex="0" aria-label="${esc(site.name)}" data-act="site" data-arg="${site.id}" style="cursor:pointer">
    <circle cx="${site.x}" cy="${site.y}" r="${selected ? 3.6 : 2.8}" style="${style}" stroke-width="${selected ? 1 : 0.7}"${cls}/>
    ${mark}
    <text x="${site.x}" y="${labelY}" text-anchor="middle" class="map-site${st === 'locked' ? ' locked' : ''}">${esc(name)}</text>
  </g>`;
}

const FRAME = '<rect x="0" y="0" width="100" height="100" rx="3" style="fill:var(--ink-2)"/>';

function cityMap(app: App): string {
  const districts = [
    [30, 16, 'Zellerau'],
    [58, 13, 'Grombühl'],
    [46, 42, 'Altstadt'],
    [52, 70, 'Sanderau'],
    [62, 50, 'Frauenland'],
  ] as const;
  return `<svg viewBox="0 0 100 100" role="group" aria-label="Karte von Würzburg" style="width:100%;max-width:100%;height:auto;display:block">
    ${FRAME}
    <ellipse cx="22" cy="58" rx="12" ry="9" style="fill:var(--ink-3)"/>
    <ellipse cx="80" cy="36" rx="18" ry="16" style="fill:var(--ink-3);stroke:var(--line)" stroke-width="0.4"/>
    <circle cx="68" cy="30" r="5" style="fill:var(--ink);stroke:var(--brass)" stroke-width="0.6"/>
    ${label(68, 22.5, 'Kessel', 'map-label brass')}
    ${label(88, 22, 'Hubland')}
    <path d="${smooth(MAIN_CITY)}" fill="none" style="stroke:var(--frost-dim)" stroke-width="2.6" stroke-linecap="round" opacity="0.55"/>
    ${label(28, 80, 'Main')}
    ${districts.map(([x, y, t]) => label(x, y, t)).join('')}
    ${SITE_LIST.filter((x) => x.area === 'stadt').map((x) => marker(app, x)).join('')}
  </svg>`;
}

function regionMap(app: App): string {
  return `<svg viewBox="0 0 100 100" role="group" aria-label="Karte des Umlands" style="width:100%;max-width:100%;height:auto;display:block">
    <defs><pattern id="map-rhoen-hatch" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V3" style="stroke:var(--frost-dim)" stroke-width="0.8"/></pattern></defs>
    ${FRAME}
    <path d="M10 0H95V16L80 13L62 17L44 12L26 16L10 12Z" style="fill:url(#map-rhoen-hatch)" opacity="0.6"/>
    ${label(14, 9, 'Rhön', 'map-label start')}
    <path d="${smooth(MAIN_REGION)}" fill="none" style="stroke:var(--frost-dim)" stroke-width="1.8" stroke-linecap="round" opacity="0.55"/>
    <circle cx="50" cy="55" r="1.4" style="fill:var(--frost)"/>
    <text x="53" y="57" class="map-label start">Würzburg</text>
    ${label(40, 95, 'Main')}
    ${SITE_LIST.filter((x) => x.area === 'umland').map((x) => marker(app, x)).join('')}
  </svg>`;
}

const DANGER = (d: number) => (d < 0.2 ? 'gering' : d < 0.4 ? 'mittel' : 'hoch');

/** Detail block of the tapped place: text, hours, danger, loot (after exploring), and the send button or the reason. */
function detail(app: App, site: SiteDef): string {
  const s = app.s;
  const explored = s.explored.includes(site.id);
  const reason = canSend(s, site.id);
  const loot = Object.entries(site.loot) as [ResourceId, number][];
  const lootText = !explored
    ? 'unbekannt, erst nach der Erkundung'
    : loot.length
      ? loot.map(([r, n]) => `${fmt(n)} ${RESOURCE_NAMES[r]}`).join(', ')
      : 'nichts';
  let action: string;
  if (explored) action = '<p class="hint">Schon erkundet.</p>';
  else if (reason === null) action = `<button class="btn primary" data-act="sendTeam" data-arg="${site.id}">${icon('people')}Trupp losschicken</button>`;
  else action = `<p class="hint"><b>${esc(reason)}</b></p>`;
  return `<section aria-live="polite" style="display:grid;gap:8px">
    <div class="label">${explored ? 'Erkundet' : 'Ausgewählt'}</div>
    <h3 style="margin:0;font-family:var(--f-ui);font-size:18px">${esc(site.name)}</h3>
    <p class="desc">${esc(site.desc)}</p>
    <dl class="kv">
      <dt>Hinweg</dt><dd>${site.hours} h</dd>
      <dt>Gefahr</dt><dd>${DANGER(site.danger)}</dd>
      <dt>Beute</dt><dd>${esc(lootText)}</dd>
    </dl>
    <div>${action}</div>
  </section>`;
}

/** A time as "Tag 3 · 10:00" (arrivals may fall between two game hours, so they round up). */
const when = (t: number) => `Tag ${dayOf(Math.ceil(t))} · ${hhmm(Math.ceil(t))}`;

function underway(app: App): string {
  const rows = app.s.expeditions.map((e) => {
    const back = e.phase === 'back';
    return `<div class="li"><span class="grow">${esc(SITES[e.site].name)} · ${e.members.length} Leute</span><span class="meta">${back ? 'Rückkehr' : 'Ankunft'} ${when(back ? e.returnAt : e.arriveAt)}</span></div>`;
  });
  return `<div>
    <div class="label">Unterwegs</div>
    <div class="list" style="margin-top:6px">${rows.join('') || '<p class="hint">Kein Trupp unterwegs.</p>'}</div>
  </div>`;
}

PANELS.karte = (app) => {
  const tab = app.sheet?.tab === 'umland' ? 'umland' : 'stadt';
  const site = app.sheet?.arg ? SITES[app.sheet.arg] : undefined;
  return {
    title: 'Karte',
    sub: tab === 'stadt' ? 'Erkundung der Stadt' : 'Erkundung des Umlands',
    tabs: [
      { id: 'stadt', label: 'Würzburg' },
      { id: 'umland', label: 'Umland' },
    ],
    tab,
    body: `${tab === 'stadt' ? cityMap(app) : regionMap(app)}
      ${site ? detail(app, site) : '<p class="hint">Einen Ort antippen, um einen Trupp dorthin zu schicken.</p>'}
      ${underway(app)}`,
  };
};

ACTIONS.site = (app, id) => {
  if (app.sheet) app.sheet.arg = id;
};

ACTIONS.sendTeam = (app, id) => {
  const reason = canSend(app.s, id);
  if (reason) {
    app.toast(reason, 'bad');
    return;
  }
  send(app.s, id);
};

// right after the laws entry
const at = BAR.findIndex((b) => b.id === 'gesetze');
BAR.splice(at < 0 ? BAR.length : at + 1, 0, { id: 'karte', label: 'Karte', icon: 'map' });
