import { defaults, passiveDefaults, calculate, comparePassives, benefit, migrate, sum } from './calculator.js?v=13';
const KEY = 'poe2-damage-calculator-v2';
const LEGACY_KEY = 'poe2-damage-calculator-v1';
const $ = s => document.querySelector(s);
const fmt = n => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(n);
const pct = n => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 }).format(n);
const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
const sections = [
  { key: 'added', title: '附加点伤', unit: '点', min: 0, hint: '多条相加。填写已折算技能伤害效用的平均附加伤害。' },
  { key: 'gain', title: '额外伤害(gain)', unit: '%', min: 0, hint: '' },
  { key: 'inc', title: '伤害增加(inc)', unit: '%', min: -100, hint: '所有适用的 increased 相加；reduced 填负数。' },
  { key: 'speed', title: '攻击速度增加', unit: '%', min: -100, hint: 'increased 相加；reduced 填负数，作用于顶部原始攻速。' },
  { key: 'critInc', title: '暴击率增加', unit: '%', min: -100, hint: '基础暴击率 ×（1 + 增加合计）。不是直接给最终暴击率加百分点。' },
  { key: 'bonusInc', title: '暴击伤害加成增加', unit: '%', min: -100, hint: '基础暴击伤害加成 ×（1 + 增加合计）。基础通常为 100%，请按实际填写。', base: 'baseBonus', baseLabel: '基础暴击伤害加成' },
];
let state = structuredClone(defaults), history = [], valid = true, migrated = false, selectedId = null;
function notice(text) { $('#notice').hidden = !text; $('#notice').textContent = text; }
try {
  const current = localStorage.getItem(KEY), old = current ? null : localStorage.getItem(LEGACY_KEY);
  if (current || old) {
    const saved = JSON.parse(current || old); state = migrate(saved.state); migrated = !!old;
    let skipped = 0;
    history = (Array.isArray(saved.history) ? saved.history : []).flatMap(h => {
      try { if (typeof h.id !== 'string' || !Number.isFinite(Date.parse(h.date))) throw Error(); return [{ ...h, state: migrate(h.state), migrated: !!old || !!h.migrated }]; }
      catch { skipped++; return []; }
    }).slice(0, 50);
    if (skipped) notice(`${skipped} 条无效记录未载入。原存储未删除。`);
  }
} catch { notice('无法读取本地记录，已载入默认参数；原存储未删除。'); }
if (migrated) notice('旧配置已迁移，原 DPS 保留。旧版最终攻速与最终暴击率暂作原始值，请核对后再填写对应 increased；暴击伤害按基础加成 100% 拆分。');
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify({ state, history })); $('#storage-error').hidden = true; }
  catch { $('#storage-error').hidden = false; $('#storage-error').textContent = '本地存储不可用，当前修改未保存'; }
}
function numeric(value, label, min = 0, max) {
  const input = el('input'); input.type = 'number'; input.step = 'any'; input.required = true; input.min = min; if (max !== undefined) input.max = max; input.value = value; input.setAttribute('aria-label', label); return input;
}
function renderSection(config, moreIndex) {
  const isMore = config.key === 'more';
  const rows = isMore ? state.more.map(group => ({
    get name() { return group.name; },
    set name(value) { group.name = value; },
    get value() { return sum(group.entries); },
    set value(value) { group.entries = [{ name: '', value }]; }
  })) : state[config.key];
  const card = el('details', 'multiplier');
  const summary = el('summary'), summaryTitle = el('span', 'summary-title', config.title);
  summary.append(summaryTitle, el('span', 'subtotal'));
  card.append(summary);
  const body = el('div', 'multiplier-body');
  card.id = `group-${config.key}`;
  if (config.base) {
    const label = el('label', 'base-inline', config.baseLabel), wrap = el('span', 'input-wrap');
    const input = numeric(state[config.base], config.baseLabel, 0, config.baseMax);
    input.addEventListener('input', () => { state[config.base] = input.valueAsNumber; update(); });
    wrap.append(input, el('span', '', '%')); label.append(wrap); body.append(label);
  }
  rows.forEach((row, i) => {
    const line = el('div', 'more-row'), name = el('input'), wrap = el('span', 'input-wrap');
    name.type = 'text'; name.value = row.name; name.placeholder = '备注（选填）'; name.maxLength = 80; name.setAttribute('aria-label', `${config.title} 备注 ${i + 1}`);
    name.addEventListener('input', () => { row.name = name.value; update(); });
    const value = numeric(row.value, `${config.title} 数值 ${i + 1}`, config.min);
    value.addEventListener('input', () => { row.value = value.valueAsNumber; update(); });
    wrap.append(value, el('span', '', config.unit));
    const remove = el('button', 'remove', '×'); remove.type = 'button'; remove.setAttribute('aria-label', `删除${config.title}条目 ${i + 1}`);
    remove.addEventListener('click', () => { (isMore ? state.more : rows).splice(i, 1); renderGroups(); update(); });
    line.append(wrap, name, remove); body.append(line);
  });
  const add = el('button', 'add', '添加条目'); add.type = 'button'; add.disabled = rows.length >= (isMore ? 30 : 50); add.setAttribute('aria-label', `${config.title}添加条目`);
  add.addEventListener('click', () => { if (isMore) state.more.push({ name: '', entries: [{ name: '', value: 0 }] }); else rows.push({ name: '', value: 0 }); renderGroups(); update(); });
  const help = el('details', 'inline-help'); help.append(el('summary', '', '计算说明'), el('p', 'hint', config.hint));
  body.append(add); if (config.hint) body.append(help); card.append(body);
  return card;
}
function renderGroups() {
  const openIds = new Set([...document.querySelectorAll('.multiplier[open]')].map(n => n.id));
  $('#groups').replaceChildren(...sections.map(c => renderSection(c)));
  $('#more-groups').replaceChildren(renderSection({ key: 'more', title: '伤害总增(more)', min: -100, unit: '%', hint: '每条为独立倍率，条目之间相乘；负数表示 less。' }));
  for (const id of openIds) { const node = document.getElementById(id); if (node) node.open = true; }
}
function fill() { for (const key of ['base', 'baseRate', 'baseCrit']) $('#form').elements[key].value = state[key]; renderGroups(); state.passives = { ...passiveDefaults }; update(); }
function renderBenefits(r) {
  $('#unit-results').replaceChildren();
  for (const config of sections) {
    const card = $(`#group-${config.key}`), total = r.totals[config.key];
    card.querySelector('.subtotal').textContent = `${pct(total)}${config.unit}`;
    unitBenefit(config.title, benefit(state, config.key), config.key === 'added' ? '+1 点' : '+1 个百分点');
  }
  $('#group-more .subtotal').textContent = `${pct((r.more - 1) * 100)}%`;
  state.more.forEach((g, i) => {
    unitBenefit(`伤害总增(more) · 第 ${i + 1} 条`, benefit(state, 'more', 1, i), '+1 个百分点');
  });
}
function unitBenefit(title, b, label) {
  const row = el('div', 'unit-row'); row.append(el('strong', '', title));
  const detail = el('span'); detail.textContent = `${label} → +${fmt(b.delta)} DPS${b.percent === null ? '（当前 DPS 为 0，相对收益不定义）' : `（+${pct(b.percent)}%）`}`;
  row.append(detail); $('#unit-results').append(row);
}
function update() {
  try {
    if (!$('#form').checkValidity()) throw Error('请填写有效数字，并检查允许的数值范围。');
    const r = calculate(state), comparison = comparePassives(state); renderBenefits(r); valid = true; $('#error').textContent = '';
    for (const key of ['dps', 'hit', 'average']) $('#' + key).textContent = fmt(r[key]);
    $('#rate').textContent = `${pct(r.rate)} 次/秒`; $('#crit').textContent = `${pct(r.crit)}%`;
    $('#bonus-result').textContent = `最终暴击伤害加成 ${pct(r.bonus)}% · 暴击伤害 ×${pct(1 + r.bonus / 100)}`;
    $('#comparison').replaceChildren(...comparison.map(c => {
      const row = el('tr', c.rating), title = el('td', '', c.name);
      title.append(el('small', '', `+${pct(c.amount)}% increased`));
      row.append(title, el('td', '', `+${fmt(c.delta)}`), el('td', '', c.percent === null ? '—' : `+${pct(c.percent)}%`), el('td', '', c.rating === 'good' ? '建议投入' : c.rating === 'poor' ? '收益较低' : c.delta <= 0 ? '无提升' : '可选')); return row;
    }));
    const best = comparison.filter(c => c.rating === 'good');
    $('#recommendation').textContent = best.length ? `当前优先：${best.map(c => c.name).join(' / ')}` : '当前这些小点均无伤害提升，请检查基础伤害、攻速或零倍率。';
    $('#formula').textContent = `(${fmt(state.base)} + ${fmt(r.totals.added)}) × ${pct(1 + r.totals.gain / 100)} Gain × ${pct(1 + r.totals.inc / 100)} inc × ${pct(r.more)} More × ${pct(1 + r.crit / 100 * r.bonus / 100)} 暴击期望 × ${pct(r.rate)} 攻速 = ${fmt(r.dps)} DPS。`;
    persist();
  } catch (e) {
    valid = false; $('#error').textContent = e.message;
    for (const key of ['dps', 'hit', 'average', 'rate', 'crit']) $('#' + key).textContent = '—';
    $('#comparison').replaceChildren(); $('#recommendation').textContent = '输入有效参数后显示建议'; $('#bonus-result').textContent = ''; $('#formula').textContent = '';
    document.querySelectorAll('.subtotal').forEach(n => n.textContent = '输入有误'); $('#unit-results').replaceChildren();
  }
  $('#save').disabled = !valid; $('#show-results').disabled = !valid;
}
function showView(results) {
  $('#results').hidden = !results; $('#result-placeholder').hidden = results;
  if (results) { $('#results-title').focus(); }
  else { $('#show-results').focus(); }
}
$('#show-results').addEventListener('click', () => { update(); if (valid) { showView(true); } });
$('#back-edit').addEventListener('click', () => { showView(false); });
$('#form').addEventListener('submit', e => e.preventDefault());
for (const key of ['base', 'baseRate', 'baseCrit']) $('#form').elements[key].addEventListener('input', e => { state[key] = e.target.valueAsNumber; update(); });
$('#reset').addEventListener('click', () => { state = structuredClone(defaults); notice(''); fill(); document.querySelectorAll('.multiplier').forEach(n => n.open = false); });
$('#save').addEventListener('click', () => { update(); if (!valid) return; history.unshift({ id: crypto.randomUUID(), date: new Date().toISOString(), state: structuredClone(state) }); history = history.slice(0, 50); selectedId = history[0].id; persist(); renderHistory(); });
function renderHistory() {
  const list = $('#history-list'); list.replaceChildren(); $('#history-count').textContent = String(history.length);
  if (!history.length) { list.append(el('p', 'history-empty', '暂无保存记录')); return; }
  history.forEach(h => {
    const row = el('div', 'history-menu-row'), load = el('button', 'history-select'), remove = el('button', 'history-remove', '×');
    load.type = remove.type = 'button';
    const damage = fmt(calculate(h.state).dps);
    const date = new Date(h.date).toLocaleString('zh-CN');
    load.append(el('strong', '', damage + ' DPS'), el('small', '', date));
    load.title = date + ' · 基础 ' + fmt(h.state.base) + ' · 原始攻速 ' + pct(h.state.baseRate);
    if (selectedId === h.id) load.setAttribute('aria-current', 'true');
    load.addEventListener('click', () => {
      state = structuredClone(h.state); selectedId = h.id;
      notice(h.migrated ? '旧版配置：最终攻速与最终暴击率暂作原始值，请核对后再填写对应 increased。' : '');
      fill(); showView(true); renderHistory();
    });
    remove.setAttribute('aria-label', '删除 ' + damage + ' DPS · ' + date);
    remove.addEventListener('click', () => { history = history.filter(item => item.id !== h.id); if (selectedId === h.id) selectedId = null; persist(); renderHistory(); });
    row.append(load, remove); list.append(row);
  });
}
$('#form').addEventListener('input', () => { if (selectedId !== null) { selectedId = null; renderHistory(); } }, true);
$('#reset').addEventListener('click', () => { selectedId = null; renderHistory(); });
const sizeObserver = new ResizeObserver(entries => {
  const height = entries[0].target.getBoundingClientRect().height;
  if (height > 0) document.documentElement.style.setProperty('--overview-height', `${height}px`);
});
sizeObserver.observe($('#base-editor'));
fill(); renderHistory();
