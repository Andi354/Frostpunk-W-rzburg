import { genCoalPerHour, genHeat, genRange } from '../../sim/heat';
import { setBoiler, setBoilerLevel, setOverdrive } from '../../sim/sim';
import { forecast, outsideTemp } from '../../sim/weather';
import { ACTIONS, BAR, PANELS, fmt } from '../app';
import { icon } from '../icons';

export function forecastHtml(time: number, precise: number): string {
  const days = forecast(time, 7, precise);
  return `<div class="forecast">${days
    .map((d, i) => {
      const depth = Math.min(100, Math.max(6, (-d.temp / 95) * 100));
      return `<div class="fday${d.storm ? ' storm' : ''}${i === 0 ? ' today' : ''}"><span>T${d.day}</span><div class="col"><i style="height:${depth}%"></i></div><b>${i < precise ? '' : '≈'}${d.temp}°</b></div>`;
    })
    .join('')}</div>`;
}

PANELS.boiler = (app) => {
  const s = app.s;
  const g = s.gen;
  const coal = genCoalPerHour(s);
  const hours = coal > 0 ? s.res.coal / coal : Infinity;
  const precise = s.research.done.includes('wetterdienst') ? 5 : 2;
  return {
    title: 'Der Kessel',
    sub: 'Heizwerk im Krater am Hubland',
    body: `
      <p class="desc">Die Amerikaner haben ihn für die Kaserne gebaut und sind gegangen. Solange er brennt, lebt die Siedlung.</p>
      <div class="seg">
        <button class="btn ${g.on ? 'primary' : ''}" data-act="boilerOn" data-arg="${g.on ? 0 : 1}" ${!g.on && s.res.coal <= 0 ? 'disabled' : ''}>${icon('boiler')}${g.on ? 'Brennt' : 'Anheizen'}</button>
        <button class="btn ${g.overdrive ? 'danger' : ''}" data-act="overdrive" ${g.on ? '' : 'disabled'} aria-pressed="${g.overdrive}">Überdruck</button>
      </div>
      <div>
        <div class="label">Druckstufe</div>
        <div class="seg" style="margin-top:6px">
          ${[1, 2, 3].map((l) => `<button class="btn" data-act="boilerLevel" data-arg="${l}" aria-pressed="${g.level === l}">Stufe ${l}</button>`).join('')}
        </div>
      </div>
      <dl class="kv">
        <dt>Wärme im Umkreis</dt><dd class="warm">+${genHeat(s)} °C</dd>
        <dt>Reichweite</dt><dd>${genRange(s)} Ringe</dd>
        <dt>Verbrauch</dt><dd>${coal.toFixed(1)} Kohle/h</dd>
        <dt>Kohle reicht für</dt><dd class="${hours < 24 ? 'bad' : ''}">${hours === Infinity ? '—' : `${fmt(hours)} h`}</dd>
        <dt>Draußen</dt><dd class="coldc">${Math.round(outsideTemp(s.time))} °C</dd>
      </dl>
      <div>
        <div class="label">Kesseldruck ${g.stress > 60 ? '<span class="bad">· kritisch</span>' : ''}</div>
        <div class="gauge stress" style="margin-top:6px"><i style="width:${g.stress}%"></i></div>
        <p class="hint" style="margin-top:6px">Überdruck gibt +15 °C, frisst aber 50 % mehr Kohle und belastet den Kessel. Bei 100 % birst er.</p>
      </div>
      <div>
        <div class="label">Wetterbericht</div>
        <div style="margin-top:6px">${forecastHtml(s.time, precise)}</div>
      </div>`,
  };
};

ACTIONS.boilerOn = (app, arg) => setBoiler(app.s, arg === '1');
ACTIONS.boilerLevel = (app, arg) => setBoilerLevel(app.s, Number(arg));
ACTIONS.overdrive = (app) => setOverdrive(app.s, !app.s.gen.overdrive);

BAR.push({ id: 'boiler', label: 'Kessel', icon: 'boiler' });
