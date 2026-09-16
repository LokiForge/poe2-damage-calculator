import { defaults, passiveDefaults, calculate, comparePassives, benefit, migrate, sum } from './calculator.js?v=4';
const KEY = 'poe2-damage-calculator-v2';
const LEGACY_KEY = 'poe2-damage-calculator-v1';
const $ = s => document.querySelector(s);
const fmt = n => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(n);
const pct = n => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 }).format(n);
const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
const sections = [
  { key: 'added', title: '附加基础伤害', unit: '点', min: 0, hint: '多条相加。填写已折算技能伤害效用的平均附加伤害。' },
  { key: 'gain', title: 'Gain 额外伤害', unit: '%', min: 0, hint: '多条相加，再按同一份基础伤害获得额外伤害。原伤害与额外伤害使用相同增伤。' },
  { key: 'inc', title: '伤害增加（inc）', unit: '%', min: -100, hint: '所有适用的 increased 相加；reduced 填负数。' },
  { key: 'speed', title: '攻击速度增加', unit: '%', min: -100, hint: 'increased 相加；reduced 填负数，作用于顶部原始攻速。' },
  { key: 'critInc', title: '暴击率增加', unit: '%', min: -100, hint: '基础暴击率 ×（1 + 增加合计）。不是直接给最终暴击率加百分点。', base: 'baseCrit', baseLabel: '基础暴击率', baseMax: 100 },
  { key: 'bonusInc', title: '暴击伤害加成增加', unit: '%', min: -100, hint: '基础暴击伤害加成 ×（1 + 增加合计）。基础通常为 100%，请按实际填写。', base: 'baseBonus', baseLabel: '基础暴击伤害加成' },
];
let state = structuredClone(defaults), history = [], valid = true, migrated = false;
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
  try { localStorage.setItem(KEY, JSON.stringify({ state, history })); $('#save-status').textContent = '已自动保存到当前浏览器'; }
  catch { $('#save-status').textContent = '本地存储不可用，当前修改未保存'; }
}
function numeric(value, label, min = 0, max) {
  const input = el('input'); input.type = 'number'; input.step = 'any'; input.required = true; input.min = min; if (max !== undefined) input.max = max; input.value = value; input.setAttribute('aria-label', label); return input;
}
function renderSection(config, moreIndex) {
  const isMore = config.key === 'more', group = isMore ? state.more[moreIndex] : null;
  const rows = isMore ? group.entries : state[config.key];
  const card = el('details', 'multiplier'), heading = el('div', 'section-title');
  const summary = el('summary'), summaryTitle = el('span', 'summary-title', isMore ? group.name || config.title : config.title);
  summary.append(summaryTitle, el('span', 'subtotal'));
  card.append(summary);
  const body = el('div', 'multiplier-body');
  card.id = isMore ? `more-${moreIndex}` : `group-${config.key}`;
  if (isMore) {
    const name = el('input', 'group-name'); name.type = 'text'; name.value = group.name; name.maxLength = 80; name.setAttribute('aria-label', `More 乘区 ${moreIndex + 1} 名称`);
    name.addEventListener('input', () => { group.name = name.value; summaryTitle.textContent = name.value || config.title; update(); });
    const remove = el('button', 'quiet', '删除乘区'); remove.type = 'button'; remove.addEventListener('click', () => { state.more.splice(moreIndex, 1); renderGroups(); update(); });
    heading.append(name, remove);
  }
  if (isMore) body.append(heading);
  if (config.base) {
    const label = el('label', 'base-inline', config.baseLabel), wrap = el('span', 'input-wrap');
    const input = numeric(state[config.base], config.baseLabel, 0, config.baseMax);
    input.addEventListener('input', () => { state[config.base] = input.valueAsNumber; update(); });
    wrap.append(input, el('span', '', '%')); label.append(wrap); body.append(label);
  }
  rows.forEach((row, i) => {
    const line = el('div', 'more-row'), name = el('input'), wrap = el('span', 'input-wrap');
    name.type = 'text'; name.value = row.name; name.placeholder = `来源 ${i + 1}（选填）`; name.maxLength = 80; name.setAttribute('aria-label', `${config.title} 来源 ${i + 1}`);
    name.addEventListener('input', () => { row.name = name.value; update(); });
    const value = numeric(row.value, `${config.title} 数值 ${i + 1}`, config.min);
    value.addEventListener('input', () => { row.value = value.valueAsNumber; update(); });
    wrap.append(value, el('span', '', config.unit));
    const remove = el('button', 'remove', '×'); remove.type = 'button'; remove.setAttribute('aria-label', `删除${config.title}条目 ${i + 1}`);
    remove.addEventListener('click', () => { rows.splice(i, 1); renderGroups(); update(); });
    line.append(name, wrap, remove); body.append(line);
  });
  const add = el('button', 'add', '添加条目'); add.type = 'button'; add.disabled = rows.length >= 50; add.setAttribute('aria-label', `${config.title}添加条目`);
  add.addEventListener('click', () => { rows.push({ name: '', value: 0 }); renderGroups(); update(); });
  const help = el('details', 'inline-help'); help.append(el('summary', '', '计算说明'), el('p', 'hint', config.hint));
  body.append(add, help); card.append(body);
  return card;
}
function renderGroups() {
  const openIds = new Set([...document.querySelectorAll('.multiplier[open]')].map(n => n.id));
  $('#groups').replaceChildren(...sections.map(c => renderSection(c)));
  $('#more-groups').replaceChildren(...state.more.map((g, i) => renderSection({ key: 'more', title: `More ${i + 1}`, min: -100, unit: '%', hint: '此框条目相加；与其他 More 框相乘。负数表示 less。' }, i)));
  for (const id of openIds) { const node = document.getElementById(id); if (node) node.open = true; }
  $('#add-more').disabled = state.more.length >= 30;
}
function renderPassiveInputs() {
  const names = { inc: '伤害 inc 小点', speed: '攻速小点', critInc: '暴击率小点', bonusInc: '暴击伤害小点' };
  $('#passive-inputs').replaceChildren(...Object.keys(passiveDefaults).map(key => {
    const label = el('label', '', names[key]), wrap = el('span', 'input-wrap'), input = numeric(state.passives[key], names[key], 0, 1000);
    input.addEventListener('input', () => { state.passives[key] = input.valueAsNumber; update(); });
    wrap.append(input, el('span', '', '% inc')); label.append(wrap); return label;
  }));
}
function fill() { for (const key of ['base', 'baseRate']) $('#form').elements[key].value = state[key]; renderGroups(); renderPassiveInputs(); update(); }
function renderBenefits(r) {
  $('#unit-results').replaceChildren();
  for (const config of sections) {
    const card = $(`#group-${config.key}`), total = r.totals[config.key];
    let text = `${pct(total)}${config.unit}`;
    if (config.key === 'critInc') text += ` · 暴击率 ${pct(r.crit)}%`;
    else if (config.key === 'bonusInc') text += ` · 加成 ${pct(r.bonus)}%`;
    else if (config.key !== 'added') text += ` · ×${pct(1 + total / 100)}`;
    card.querySelector('.subtotal').textContent = text;
    unitBenefit(config.title, benefit(state, config.key), config.key === 'added' ? '+1 点' : '+1 个百分点');
  }
  state.more.forEach((g, i) => {
    const card = $(`#more-${i}`); card.querySelector('.subtotal').textContent = `${pct(sum(g.entries))}% · ×${pct(1 + sum(g.entries) / 100)}`;
    unitBenefit(g.name || `More ${i + 1}`, benefit(state, 'more', 1, i), '+1 个百分点');
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
    valid = false; $('#error').textContent = e.message; $('#save-status').textContent = '当前输入尚未保存';
    for (const key of ['dps', 'hit', 'average', 'rate', 'crit']) $('#' + key).textContent = '—';
    $('#comparison').replaceChildren(); $('#recommendation').textContent = '输入有效参数后显示建议'; $('#bonus-result').textContent = ''; $('#formula').textContent = '';
    document.querySelectorAll('.subtotal').forEach(n => n.textContent = '输入有误'); $('#unit-results').replaceChildren();
  }
  $('#save').disabled = !valid; $('#show-results').disabled = !valid;
}
function showView(results) {
  $('#base-editor').hidden = results; $('#editor').hidden = results; $('#results').hidden = !results;
  if (results) { $('#results-title').focus(); }
  else { $('#form').elements.base.focus(); }
}
$('#show-results').addEventListener('click', () => { update(); if (valid) { showView(true); $('#results').scrollIntoView({ block: 'start' }); } });
$('#back-edit').addEventListener('click', () => { showView(false); $('#form').scrollIntoView({ block: 'start' }); });
$('#form').addEventListener('submit', e => e.preventDefault());
for (const key of ['base', 'baseRate']) $('#form').elements[key].addEventListener('input', e => { state[key] = e.target.valueAsNumber; update(); });
$('#add-more').addEventListener('click', () => { state.more.push({ name: `More ${state.more.length + 1}`, entries: [{ name: '', value: 0 }] }); renderGroups(); const last = $('#more-groups').lastElementChild; if (last) last.open = true; update(); });
$('#reset').addEventListener('click', () => { state = structuredClone(defaults); notice(''); fill(); document.querySelectorAll('.multiplier').forEach(n => n.open = false); });
$('#save').addEventListener('click', () => { if (!valid) return; history.unshift({ id: crypto.randomUUID(), date: new Date().toISOString(), state: structuredClone(state) }); history = history.slice(0, 50); persist(); renderHistory(); });
function renderHistory() {
  const list = $('#history-list'); list.replaceChildren(); $('#history-count').textContent = `（${history.length}）`;
  if (!history.length) { list.append(el('div', 'empty', '暂无历史记录。点击“保存结果”添加。')); return; }
  history.forEach(h => {
    const row = el('div', 'history-entry'), record = el('div', 'record'), load = el('button', '', '载入配置'), remove = el('button', 'quiet', '删除');
    record.append(el('strong', '', `${fmt(calculate(h.state).dps)} DPS`), el('small', '', `${new Date(h.date).toLocaleString('zh-CN')} · 基础 ${fmt(h.state.base)} · 原始攻速 ${pct(h.state.baseRate)} · gain ${pct(sum(h.state.gain))}%${h.migrated ? ' · 旧版迁移' : ''}`));
    load.addEventListener('click', () => { state = structuredClone(h.state); notice(h.migrated ? '旧版配置：最终攻速与最终暴击率暂作原始值，请核对后再填写对应 increased。' : ''); fill(); showView(false); $('.history').open = false; $('#form').scrollIntoView({ block: 'start' }); });
    remove.addEventListener('click', () => { history = history.filter(item => item.id !== h.id); persist(); renderHistory(); });
    row.append(record, load, remove); list.append(row);
  });
}
fill(); renderHistory();
