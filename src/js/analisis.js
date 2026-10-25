import { state, $, fmt, fmt0, esc, ic, monthName, month, catColor } from './core.js';
import { rangeSummary, balanceSeries, presetRange } from './logic/analisis.js';
import { niceScale } from './logic/calculos.js';

// ===== Análisis por rango de fechas =====
let preset = '6m';
let range = presetRange(preset, month);

export function renderAnalysis() {
  if (preset) range = presetRange(preset, month);
  $('anFrom').value = range.from;
  $('anTo').value = range.to;
  document.querySelectorAll('#anPresets button').forEach(b => b.setAttribute('aria-pressed', b.dataset.p === preset));
  const r = rangeSummary(state.tx, range.from, range.to);
  const kpi = (label, value, sub, cls = '') =>
    `<div class="an-kpi"><small>${label}</small><b class="${cls}">${value}</b><span>${sub}</span></div>`;
  $('anKpis').innerHTML =
    kpi('Ingresos', fmt0(r.inc), `${fmt0(r.avgInc)} al mes`, 'pos') +
    kpi('Gastos', fmt0(r.exp), `${fmt0(r.avgExp)} al mes`, 'neg') +
    kpi('Neto', fmt0(r.net), r.inc ? `ahorraste ${Math.round((r.net / r.inc) * 100)}%` : 'sin ingresos', r.net >= 0 ? 'pos' : 'neg') +
    kpi('Movimientos', r.count, `en ${r.months} mes${r.months === 1 ? '' : 'es'}`);

  const bars = (list, color, empty) =>
    list.length
      ? list
          .slice(0, 8)
          .map(
            x => `
    <div class="bar-row"><div class="top"><span class="l">${color(x.name)}${esc(x.name)}</span>
    <span class="r">${fmt(x.amount)} <span style="color:var(--muted)">${x.pct}%</span></span></div>
    <div class="track"><i style="width:${(x.amount / list[0].amount) * 100}%;background:${color(x.name, true)}"></i></div></div>`
          )
          .join('')
      : `<div class="empty">${empty}</div>`;
  const sw = (c, raw) => (raw ? c : `<i class="swatch" style="background:${c}"></i>`);
  $('anCats').innerHTML = bars(r.byCat, (n, raw) => sw(catColor(n), raw), `${ic('chart')}Sin gastos en el periodo.`);
  $('anSubs').innerHTML = bars(
    r.bySub,
    (n, raw) => sw(catColor(n.split(' › ')[0]), raw),
    `${ic('list')}Agrega subcategorías a tus gastos para verlas aquí.`
  );
  $('anTags').innerHTML = bars(
    r.byTag,
    (n, raw) => (raw ? 'var(--accent)' : ic('tag').replace('class="ic"', 'class="ic" style="width:13px;height:13px;color:var(--accent)"')),
    `${ic('tag')}Usa etiquetas como #viaje para agrupar gastos de distintas categorías.`
  );
  drawLine(balanceSeries(state.tx, range.from.slice(0, 7), range.to.slice(0, 7)));
}

// Línea del balance acumulado sobre barras del neto de cada mes
export function drawLine(data = balanceSeries(state.tx, range.from.slice(0, 7), range.to.slice(0, 7))) {
  const svg = $('lineChart');
  if (!svg.clientWidth) return;
  const w = svg.clientWidth,
    h = 260,
    pl = 58,
    pr = 12,
    pt = 14,
    pb = 28;
  const css = getComputedStyle(document.documentElement),
    v = n => css.getPropertyValue(n).trim();
  const vals = data.flatMap(d => [d.acc, d.net, 0]);
  const top = niceScale(Math.max(...vals)),
    bottom = niceScale(-Math.min(...vals));
  // Mismo paso arriba y abajo de cero para que las líneas de la cuadrícula coincidan
  const step = Math.max(top.step, bottom.step),
    max = Math.ceil(Math.max(...vals) / step) * step,
    min = -Math.ceil(-Math.min(...vals) / step) * step;
  const y = val => pt + ((h - pt - pb) * (max - val)) / (max - min || 1);
  const slot = (w - pl - pr) / data.length,
    x = i => pl + slot * i + slot / 2,
    bw = Math.min(18, slot / 3);
  const short = n => {
    const a = Math.abs(n),
      s = n < 0 ? '−' : '';
    return s + '$' + (a >= 1e6 ? (a / 1e6).toFixed(1) + 'M' : a >= 1e3 ? Math.round(a / 1e3) + 'k' : a);
  };
  let s = '';
  for (let val = min; val <= max + 1e-9; val += step) {
    s += `<line x1="${pl}" x2="${w - pr}" y1="${y(val)}" y2="${y(val)}" stroke="${v('--border')}" ${val ? 'stroke-dasharray="2 4"' : ''}/>`;
    s += `<text x="${pl - 8}" y="${y(val) + 4}" text-anchor="end" font-size="11" fill="${v('--muted')}" font-family="JetBrains Mono, monospace">${short(val)}</text>`;
  }
  const every = Math.ceil(data.length / 8);
  data.forEach((d, i) => {
    const y0 = y(0),
      yn = y(d.net);
    s += `<rect x="${x(i) - bw / 2}" y="${Math.min(y0, yn)}" width="${bw}" height="${Math.max(1, Math.abs(yn - y0))}" rx="3" fill="${d.net >= 0 ? v('--pos') : v('--neg')}" opacity=".35"/>`;
    if (i % every === 0 || i === data.length - 1)
      s += `<text x="${x(i)}" y="${h - 8}" text-anchor="middle" font-size="11" fill="${v('--muted')}">${monthName(d.m, { month: 'short' }).replace('.', '')}${data.length > 12 || d.m.endsWith('-01') ? ' ' + d.m.slice(2, 4) : ''}</text>`;
  });
  const pts = data.map((d, i) => `${x(i)},${y(d.acc)}`).join(' ');
  s += `<polygon points="${x(0)},${y(0)} ${pts} ${x(data.length - 1)},${y(0)}" fill="${v('--accent')}" opacity=".1"/>`;
  s += `<polyline points="${pts}" fill="none" stroke="${v('--accent')}" stroke-width="2.5" stroke-linejoin="round"/>`;
  data.forEach((d, i) => {
    s += `<circle cx="${x(i)}" cy="${y(d.acc)}" r="${i === data.length - 1 ? 5 : 3}" fill="${v('--accent')}" stroke="${v('--surface')}" stroke-width="2"/>`;
  });
  data.forEach((d, i) => {
    s += `<rect class="hit" data-i="${i}" x="${x(i) - slot / 2}" y="${pt}" width="${slot}" height="${h - pt - pb}" fill="transparent"/>`;
  });
  svg.innerHTML = s;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const tip = $('lineTip');
  svg.querySelectorAll('.hit').forEach(r => {
    r.onmouseenter = () => {
      const d = data[r.dataset.i];
      tip.innerHTML = `<div style="text-transform:capitalize">${monthName(d.m)}</div>Neto del mes <b>${fmt(d.net)}</b><br>Acumulado <b>${fmt(d.acc)}</b>`;
      tip.style.left = Math.min(Math.max(x(+r.dataset.i), 90), w - 90) + 'px';
      tip.style.top = Math.min(y(d.acc), y(d.net)) - 10 + 'px';
      tip.style.opacity = 1;
    };
    r.onmouseleave = () => (tip.style.opacity = 0);
  });
}

$('anPresets').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) {
    preset = b.dataset.p;
    renderAnalysis();
  }
});
['anFrom', 'anTo'].forEach(id =>
  $(id).addEventListener('change', () => {
    if (!$('anFrom').value || !$('anTo').value) return;
    preset = null;
    range = { from: $('anFrom').value, to: $('anTo').value };
    if (range.from > range.to) [range.from, range.to] = [range.to, range.from];
    renderAnalysis();
  })
);
