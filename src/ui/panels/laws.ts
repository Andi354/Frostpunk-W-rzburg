import { LAWS, type LawDef, type LawMood } from '../../sim/data/laws';
import { canSign, sign } from '../../sim/laws';
import { ACTIONS, BAR, PANELS, esc, type App } from '../app';

/** A signed number with its sign: "+5", "−0,03". */
function signed(n: number, digits: number): string {
  const body = Math.abs(n).toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${n < 0 ? '−' : '+'}${body}`;
}

/** The effects of a law in plain German, one line for the one-off change and one for the hourly change. */
function effects(l: LawDef): string[] {
  const parts = (m: LawMood, digits: number) =>
    [
      m.discontent !== undefined ? `Unmut ${signed(m.discontent, digits)}` : '',
      m.hope !== undefined ? `Hoffnung ${signed(m.hope, digits)}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
  const out: string[] = [];
  if (l.onSign) out.push(`Sofort: ${parts(l.onSign, 0)}`);
  if (l.perHour) out.push(`Jede Stunde: ${parts(l.perHour, 2)}`);
  return out;
}

function card(app: App, l: LawDef): string {
  const s = app.s;
  const isSigned = s.laws.signed.includes(l.id);
  const reason = canSign(s, l.id);
  const armed = app.armed === `law:${l.id}`;
  const tag = isSigned ? 'In Kraft' : reason ?? (armed ? 'Wirklich erlassen?' : '');
  const cls = `card${isSigned ? ' done' : ''}${reason && !isSigned ? ' locked' : ''}${armed ? ' active' : ''}`;
  return `<button class="${cls}" data-act="law" data-arg="${l.id}" ${reason ? 'disabled' : ''}>
    <h3>${esc(l.name)}</h3>
    <p>${esc(l.desc)}</p>
    ${effects(l).map((e) => `<p>${esc(e)}</p>`).join('')}
    ${tag ? `<span class="tag">${esc(tag)}</span>` : ''}
  </button>`;
}

PANELS.gesetze = (app) => {
  const s = app.s;
  const tabs = [
    { id: 'not', label: 'Not' },
    { id: 'weg', label: 'Weg' },
  ];
  if (s.laws.path === 'order') tabs.push({ id: 'order', label: 'Ordnung' });
  if (s.laws.path === 'faith') tabs.push({ id: 'faith', label: 'Glaube' });
  const requested = app.sheet?.tab ?? 'not';
  const tab = tabs.some((t) => t.id === requested) ? requested : 'not';

  const wait = s.laws.readyAt - s.time;
  const cooldown = wait > 0 ? `Nächstes Gesetz in ${Math.ceil(wait)} h.` : 'Die Verwaltung kann wieder ein Gesetz erlassen.';
  const inForce = s.laws.signed.map((id) => `<div class="li">${esc(LAWS[id].name)}</div>`).join('');
  return {
    title: 'Gesetze',
    sub: 'Bekanntmachung der Stadtverwaltung Würzburg-Hubland',
    tabs,
    tab,
    body: `
      <div class="notice">${esc(cooldown)}</div>
      <div class="cards">${Object.values(LAWS)
        .filter((l) => l.tab === tab)
        .map((l) => card(app, l))
        .join('')}</div>
      <div>
        <div class="label">In Kraft</div>
        <div class="list" style="margin-top:6px">${inForce || '<p class="hint">Noch kein Gesetz erlassen.</p>'}</div>
      </div>`,
  };
};

ACTIONS.law = (app, id) => {
  const reason = canSign(app.s, id);
  if (reason !== null) {
    app.armed = null;
    app.toast(reason, 'bad');
    return;
  }
  // signing needs a second tap
  if (app.armed !== `law:${id}`) {
    app.armed = `law:${id}`;
    return;
  }
  app.armed = null;
  sign(app.s, id);
};

// right after the research entry
const at = BAR.findIndex((b) => b.id === 'forschung');
BAR.splice(at < 0 ? BAR.length : at + 1, 0, {
  id: 'gesetze',
  label: 'Gesetze',
  icon: 'laws',
  badge: (s) => (Object.keys(LAWS).some((id) => canSign(s, id) === null) ? 1 : 0),
});
