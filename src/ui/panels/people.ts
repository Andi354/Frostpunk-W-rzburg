import { careCapacity, carePlan, census, moodCauses } from '../../sim/people';
import { dayOf } from '../../sim/weather';
import { BAR, PANELS, esc, fmt, hhmm } from '../app';

/** Sheet "Leute": census, care against the patients, the causes of the mood, and the last log lines. */
PANELS.leute = (app) => {
  const s = app.s;
  const c = census(s);
  const cap = careCapacity(s);
  const patients = c.sick + c.grave;
  const cared = carePlan(s).size;
  const causes = moodCauses(s);
  const kv: [string, number][] = [
    ['Einwohner', c.total],
    ['Arbeiter', c.workers],
    ['Fachkräfte', c.engineers],
    ['Kinder', c.children],
    ['Obdachlos', c.homeless],
    ['Krank', c.sick],
    ['Schwerkrank', c.grave],
    ['Hungrig', c.hungry],
    ['Ohne Arbeit', c.idle],
    ['Unterwegs', c.away],
  ];
  const lines = s.log
    .slice(-15)
    .reverse()
    .map((e) => `<div class="li"><span class="grow ${e.kind === 'info' ? '' : e.kind}">${esc(e.text)}</span><span class="meta">Tag ${dayOf(e.t)} · ${hhmm(e.t)}</span></div>`)
    .join('');
  return {
    title: 'Leute',
    sub: `Tag ${dayOf(s.time)} · ${fmt(c.total)} Menschen`,
    body: `
      <p class="desc">Wer kein Dach hat, friert. Wer hungert oder krank ist, wird schwächer. Die Pflege reicht nur für so viele.</p>
      <dl class="kv">${kv.map(([k, v]) => `<dt>${k}</dt><dd>${fmt(v)}</dd>`).join('')}</dl>
      <dl class="kv">
        <dt>Pflegeplätze</dt><dd>${fmt(cap)}</dd>
        <dt>Gepflegt</dt><dd class="${cared < patients ? 'bad' : ''}">${cared} / ${patients}</dd>
      </dl>
      <div>
        <div class="label">Stimmung</div>
        <dl class="kv" style="margin-top:6px">
          <dt>Hoffnung</dt><dd>${fmt(s.hope)}</dd>
          <dt>Unmut</dt><dd class="${s.discontent >= 70 ? 'bad' : ''}">${fmt(s.discontent)}</dd>
        </dl>
        ${s.flags.heimkehrer !== undefined ? `<p class="hint" style="margin-top:6px">Rückkehrbewegung: ${fmt(s.flags.heimkehrer)} %</p>` : ''}
        <div class="list" style="margin-top:8px">${causes.length ? causes.map((t) => `<div class="li">${esc(t)}</div>`).join('') : '<p class="hint">Im Moment keine besondere Not.</p>'}</div>
      </div>
      <div>
        <div class="label">Letzte Meldungen</div>
        <div class="list" style="margin-top:6px">${lines || '<p class="hint">Noch nichts passiert.</p>'}</div>
      </div>`,
  };
};

// right after the boiler entry
const at = BAR.findIndex((b) => b.id === 'boiler');
BAR.splice(at < 0 ? BAR.length : at + 1, 0, { id: 'leute', label: 'Leute', icon: 'people' });
