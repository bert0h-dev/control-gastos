import { state, $, fmt, fmt0, esc, ic, monthName, month, catColor, today } from './core.js';
import { expensesByCategory, compareMonths, chartSeries, niceScale, sum } from './logic/calculos.js';
import { projectMonth, dailySpend } from './logic/analisis.js';
import { cardAlerts } from './cuentas.js';

const shortDate = d => new Date(d + 'T12:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

function renderCardAlerts() {
  $('cardAlerts').innerHTML = cardAlerts()
    .map(
      ({ c, s }) => `<div class="alert">${ic('card')}<div>${
        s.level === 'overdue'
          ? `El pago de <b>${esc(c.name)}</b> venció el ${shortDate(s.due)}. Pendiente: <b>${fmt(s.toPay)}</b>.`
          : `Paga <b>${fmt(s.toPay)}</b> de <b>${esc(c.name)}</b> antes del ${shortDate(s.due)} (${s.daysToDue === 0 ? 'hoy' : `en ${s.daysToDue} día${s.daysToDue === 1 ? '' : 's'}`}).`
      }
    <a href="#cuentas" style="margin-left:6px">Ver tarjeta</a></div></div>`
    )
    .join('');
}

function renderProjection() {
  const p = projectMonth(state.tx, state.recurring, month, today());
  $('projLabel').textContent = p.isCur ? `día ${p.day} de ${p.total}` : month < today().slice(0, 7) ? 'mes cerrado' : 'mes futuro';
  if (!p.isCur) {
    $('projBody').innerHTML =
      `<div class="proj"><div class="proj-big"><b class="${p.projBal >= 0 ? 'pos' : 'neg'}">${fmt(p.projBal)}</b><span class="hint">balance ${month < today().slice(0, 7) ? 'final' : 'registrado'}</span></div>
      <p class="hint" style="margin:0">La proyección solo aplica al mes en curso. Usa las flechas de la cabecera para volver al mes actual.</p></div>`;
    return;
  }
  const max = Math.max(p.projExp, p.projInc, 1),
    pc = v => ((v / max) * 100).toFixed(2) + '%';
  const restVar = Math.max(0, p.projExp - p.exp - p.pendExp);
  $('projBody').innerHTML = `<div class="proj">
    <div class="proj-big"><b class="${p.projBal >= 0 ? 'pos' : 'neg'}">${fmt(p.projBal)}</b><span class="hint">balance esperado al cierre</span></div>
    <div>
      <div class="hint" style="font-size:.78rem;margin-bottom:4px">Gastos: ${fmt0(p.projExp)} proyectados</div>
      <div class="stack" title="Gastos">
        <i style="width:${pc(p.fixedExp)};background:var(--neg)"></i>
        <i style="width:${pc(p.variable)};background:color-mix(in srgb,var(--neg) 70%,var(--surface))"></i>
        <i style="width:${pc(p.pendExp)};background:color-mix(in srgb,var(--neg) 45%,var(--surface))"></i>
        <i style="width:${pc(restVar)};background:repeating-linear-gradient(45deg,color-mix(in srgb,var(--neg) 30%,transparent) 0 4px,transparent 4px 8px)"></i>
      </div>
      <div class="hint" style="font-size:.78rem;margin:10px 0 4px">Ingresos: ${fmt0(p.projInc)} esperados</div>
      <div class="stack" title="Ingresos">
        <i style="width:${pc(p.inc)};background:var(--pos)"></i>
        <i style="width:${pc(p.pendInc)};background:repeating-linear-gradient(45deg,color-mix(in srgb,var(--pos) 40%,transparent) 0 4px,transparent 4px 8px)"></i>
      </div>
    </div>
    <div class="proj-legend">
      <div><span><i class="swatch" style="background:var(--neg)"></i>Fijos cobrados</span><b>${fmt(p.fixedExp)}</b></div>
      <div><span><i class="swatch" style="background:color-mix(in srgb,var(--neg) 70%,var(--surface))"></i>Variable hasta hoy</span><b>${fmt(p.variable)}</b></div>
      <div><span><i class="swatch" style="background:color-mix(in srgb,var(--neg) 45%,var(--surface))"></i>Recurrentes por cobrar</span><b>${fmt(p.pendExp)}</b></div>
      <div><span><i class="swatch" style="background:color-mix(in srgb,var(--neg) 30%,transparent)"></i>Variable estimado</span><b>${fmt(restVar)}</b></div>
    </div>
  </div>`;
}

function renderCalendar() {
  const days = dailySpend(state.tx, month),
    t = today(),
    max = Math.max(...days.map(d => d.amount), 1);
  const first = (new Date(month + '-01T12:00').getDay() + 6) % 7; // lunes = 0
  const top = days.reduce((a, d) => (d.amount > a.amount ? d : a), days[0]);
  $('calHint').textContent = top.amount ? `Día más alto: ${top.day} (${fmt0(top.amount)})` : '';
  const shade = a => (a ? `background:color-mix(in srgb,var(--neg) ${Math.round(15 + (a / max) * 70)}%,var(--surface-2))` : '');
  $('calendar').innerHTML =
    ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => `<div class="dow">${d}</div>`).join('') +
    '<div></div>'.repeat(first) +
    days
      .map(
        d => `<div class="d ${d.amount ? 'has' : ''} ${d.date === t ? 'today' : ''} ${d.date > t ? 'future' : ''}" style="${shade(d.amount)}"
        title="${d.day}: ${d.amount ? `${fmt(d.amount)} en ${d.count} gasto${d.count === 1 ? '' : 's'}` : 'sin gastos'}">${d.day}</div>`
      )
      .join('') +
    `<div class="cal-scale" style="grid-column:1/-1">Menos <i style="background:var(--surface-2)"></i><i style="${shade(max * 0.2)}"></i><i style="${shade(max * 0.6)}"></i><i style="${shade(max)}"></i> Más</div>`;
}

// ===== Resumen: categorías, comparativo y gráfica =====
export function renderSummary() {
  const cats = expensesByCategory(state.tx, month),
    total = sum(cats, c => c.amount);
  $('catTotal').textContent = total ? fmt(total) : '';
  $('catBars').innerHTML = cats.length
    ? cats
        .map(
          c => `
    <div class="bar-row"><div class="top"><span class="l"><i class="swatch" style="background:${catColor(c.cat)}"></i>${esc(c.cat)}</span>
    <span class="r">${fmt(c.amount)} <span style="color:var(--muted)">${c.pct}%</span></span></div>
    <div class="track"><i style="width:${(c.amount / cats[0].amount) * 100}%;background:${catColor(c.cat)}"></i></div></div>`
        )
        .join('')
    : `<div class="empty">${ic('chart')}Sin gastos en ${monthName(month, { month: 'long' })}.</div>`;
  renderCardAlerts();
  renderProjection();
  renderCalendar();
  renderCompare();
  drawChart();
}

function renderCompare() {
  const c = compareMonths(state.tx, month);
  $('cmpLabel').textContent = `${monthName(month, { month: 'short' })} vs ${monthName(c.prevMonth, { month: 'short' })}`;
  $('cmpBody').innerHTML = c.rows
    .map(r => {
      const name = r.cat
        ? `<span style="display:inline-flex;align-items:center;gap:8px"><i class="swatch" style="background:${catColor(r.cat)}"></i>${esc(r.cat)}</span>`
        : r.type === 'ingreso'
          ? 'Ingresos'
          : 'Gastos';
      const txt = r.pct === Infinity ? 'nuevo' : (r.pct > 0 ? '+' : '') + Math.round(r.pct) + '%';
      return `<tr class="${r.cat ? '' : 'total'}"><td>${name}</td><td class="num">${fmt(r.prev)}</td><td class="num">${fmt(r.cur)}</td>
      <td><span class="delta ${r.diff === 0 ? 'flat' : r.good ? 'good' : 'bad'}">${r.diff === 0 ? '—' : txt}</span></td></tr>`;
    })
    .join('');
  let html = c.alerts
    .map(
      a =>
        `<div class="alert">${ic('alert')}<div>${
          a.pct === Infinity
            ? `Nuevo gasto en <b>${esc(a.cat)}</b>: ${fmt(a.cur)} (el mes anterior no hubo).`
            : `Gastaste <b>${Math.round(a.pct)}% más</b> en <b>${esc(a.cat)}</b>: ${fmt(a.cur)} vs ${fmt(a.prev)}.`
        }</div></div>`
    )
    .join('');
  if (c.saved)
    html =
      `<div class="alert ok">${ic('check')}<div>Vas <b>${fmt(c.saved)}</b> por debajo de lo que gastaste el mes anterior.</div></div>` +
      html;
  $('cmpAlerts').innerHTML = html;
}

export function drawChart() {
  const svg = $('chart');
  if (!svg.clientWidth) return;
  const w = svg.clientWidth,
    h = 260,
    pl = 54,
    pr = 8,
    pt = 12,
    pb = 28;
  const css = getComputedStyle(document.documentElement),
    v = n => css.getPropertyValue(n).trim();
  const data = chartSeries(state.tx, month);
  const { step, max } = niceScale(Math.max(...data.flatMap(d => [d.inc, d.exp])));
  const y = val => pt + (h - pt - pb) * (1 - val / max);
  const slot = (w - pl - pr) / data.length,
    bw = Math.min(22, slot / 3.2);
  const short = n => (n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n % 1e3 ? 1 : 0) + 'k' : n);
  let s = '';
  for (let i = 0; i <= 4; i++) {
    const val = step * i,
      yy = y(val);
    s += `<line x1="${pl}" x2="${w - pr}" y1="${yy}" y2="${yy}" stroke="${v('--border')}" ${i ? 'stroke-dasharray="2 4"' : ''}/>`;
    s += `<text x="${pl - 8}" y="${yy + 4}" text-anchor="end" font-size="11" fill="${v('--muted')}" font-family="JetBrains Mono, monospace">$${short(val)}</text>`;
  }
  // Barras con extremo redondeado de 4px anclado a la base
  const bar = (x, val, col) => {
    const yy = y(val),
      hh = y(0) - yy;
    if (hh <= 0) return '';
    const r = Math.min(4, hh, bw / 2);
    return `<path d="M${x},${y(0)} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + bw - r} Q${x + bw},${yy} ${x + bw},${yy + r} V${y(0)} Z" fill="${col}"/>`;
  };
  data.forEach((d, i) => {
    const cx = pl + slot * i + slot / 2;
    s += `<g class="grp" data-i="${i}"><rect x="${cx - slot / 2}" y="${pt}" width="${slot}" height="${h - pt - pb}" fill="transparent"/>`;
    s += bar(cx - bw - 1, d.inc, v('--pos')) + bar(cx + 1, d.exp, v('--neg'));
    s += `<text x="${cx}" y="${h - 8}" text-anchor="middle" font-size="12" fill="${d.m === month ? v('--fg') : v('--muted')}" font-weight="${d.m === month ? 700 : 400}">${monthName(d.m, { month: 'short' }).replace('.', '')}</text></g>`;
  });
  svg.innerHTML = s;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const tip = $('tip');
  svg.querySelectorAll('.grp').forEach(g => {
    g.onmouseenter = () => {
      const d = data[g.dataset.i],
        cx = pl + slot * g.dataset.i + slot / 2;
      tip.innerHTML = `<div style="text-transform:capitalize">${monthName(d.m)}</div>Ingresos <b>${fmt(d.inc)}</b><br>Gastos <b>${fmt(d.exp)}</b><br>Balance <b>${fmt(d.inc - d.exp)}</b>`;
      tip.style.left = Math.min(Math.max(cx, 90), w - 90) + 'px';
      tip.style.top = y(Math.max(d.inc, d.exp)) - 8 + 'px';
      tip.style.opacity = 1;
      g.style.opacity = 1;
      svg.querySelectorAll('.grp').forEach(o => {
        if (o !== g) o.style.opacity = 0.45;
      });
    };
    g.onmouseleave = () => {
      tip.style.opacity = 0;
      svg.querySelectorAll('.grp').forEach(o => (o.style.opacity = 1));
    };
  });
}
