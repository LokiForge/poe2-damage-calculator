export const groupKeys = ['added', 'inc', 'gain', 'speed', 'critInc', 'bonusInc'];
export const passiveDefaults = { inc: 10, speed: 3, critInc: 10, bonusInc: 15 };
const entry = (value = 0, name = '') => ({ name, value });
export const defaults = {
  version: 2, base: 1000, baseRate: 1, baseCrit: 5, baseBonus: 100,
  added: [entry()], inc: [entry()], gain: [entry()], speed: [entry()],
  critInc: [entry()], bonusInc: [entry()],
  more: [{ name: '', entries: [entry()] }],
  passives: { ...passiveDefaults },
};
export const sum = rows => rows.reduce((total, row) => total + row.value, 0);
function finite(n) { if (typeof n !== 'number' || !Number.isFinite(n)) throw Error('请填写有效数字'); }
function rowsValid(rows, min) {
  if (!Array.isArray(rows) || rows.length > 50) throw Error('每个区间最多 50 条');
  for (const row of rows) {
    if (!row || typeof row.name !== 'string') throw Error('条目名称无效');
    finite(row.value);
    if (row.value < min) throw Error('条目数值超出允许范围');
  }
}
export function validate(s) {
  for (const k of ['base', 'baseRate', 'baseCrit', 'baseBonus']) { finite(s[k]); if (s[k] < 0) throw Error('基础数值不能为负数'); }
  if (s.baseCrit > 100) throw Error('基础暴击率不能超过 100%');
  for (const k of groupKeys) { rowsValid(s[k], ['added', 'gain'].includes(k) ? 0 : -100); if (sum(s[k]) < -100) throw Error('增加与降低合计不能低于 −100%'); }
  if (!Array.isArray(s.more) || s.more.length > 30) throw Error('最多 30 个独立 More 区间');
  for (const g of s.more) { if (typeof g.name !== 'string') throw Error('乘区名称无效'); rowsValid(g.entries, -100); if (sum(g.entries) < -100) throw Error('More 区间合计不能低于 −100%'); }
  for (const k of Object.keys(passiveDefaults)) { finite(s.passives?.[k]); if (s.passives[k] < 0 || s.passives[k] > 1000) throw Error('小点数值须在 0–1000% 之间'); }
}
export function calculate(s) {
  validate(s);
  const totals = Object.fromEntries(groupKeys.map(k => [k, sum(s[k])]));
  const gainedBase = (s.base + totals.added) * (1 + totals.gain / 100);
  const more = s.more.reduce((v, g) => v * (1 + sum(g.entries) / 100), 1);
  const rate = s.baseRate * (1 + totals.speed / 100);
  const crit = Math.min(100, s.baseCrit * (1 + totals.critInc / 100));
  const bonus = s.baseBonus * (1 + totals.bonusInc / 100);
  const hit = gainedBase * (1 + totals.inc / 100) * more;
  const average = hit * (1 + crit / 100 * bonus / 100);
  const dps = average * rate;
  if (![gainedBase, more, rate, crit, bonus, hit, average, dps].every(Number.isFinite)) throw Error('数值过大，请降低输入');
  return { totals, gainedBase, more, rate, crit, bonus, hit, average, dps };
}
export function increase(s, key, amount, moreIndex) {
  const next = structuredClone(s);
  const rows = key === 'more' ? next.more[moreIndex].entries : next[key];
  if (rows.length) rows[0].value += amount;
  else rows.push(entry(amount));
  return next;
}
export function benefit(s, key, amount = 1, moreIndex) {
  const before = calculate(s).dps;
  const after = calculate(increase(s, key, amount, moreIndex)).dps;
  return { after, delta: after - before, percent: before === 0 ? null : (after - before) / before * 100 };
}
export function comparePassives(s) {
  const labels = { inc: '伤害 inc', speed: '攻击速度增加', critInc: '暴击率增加', bonusInc: '暴击伤害加成增加' };
  const rows = Object.keys(passiveDefaults).map(key => ({ key, name: labels[key], amount: s.passives[key], ...benefit(s, key, s.passives[key]) })).sort((a, b) => b.delta - a.delta);
  const best = rows[0].delta;
  return rows.map(r => ({ ...r, rating: best <= 0 ? 'neutral' : r.delta >= best * (1 - 1e-9) ? 'good' : r.delta < best * 0.5 ? 'poor' : 'neutral' }));
}
export function migrate(s) {
  if (s?.version === 2) { validate(s); return structuredClone(s); }
  if (!s) throw Error('配置无效');
  for (const k of ['base', 'rate', 'crit', 'bonus', 'added', 'inc']) finite(s[k]);
  const next = { ...structuredClone(defaults), base: s.base, baseRate: s.rate, baseCrit: s.crit,
    baseBonus: 100, added: [entry(s.added)], inc: [entry(s.inc)], bonusInc: [entry(s.bonus - 100)],
    more: s.more.map(m => ({ name: m.name, entries: [entry(m.value)] })) };
  validate(next); return next;
}

export function marginalRows(s) {
  const names = { added: '附加点伤', speed: '攻击速度', critInc: '暴击率', bonusInc: '暴击伤害加成', gain: '额外伤害(gain)', inc: '伤害增加(inc)' };
  const rows = Object.entries(names).map(([key, name]) => ({ name, unit: key === 'added' ? '+1 点' : '+1 个百分点', ...benefit(s, key) }));
  s.more.forEach((g, i) => rows.push({ name: s.more.length === 1 ? '伤害总增(more)' : '伤害总增(more) · 第 ' + (i + 1) + ' 条', unit: '+1 个百分点', ...benefit(s, 'more', 1, i) }));
  if (!s.more.length) { const dps = calculate(s).dps; rows.push({ name: '伤害总增(more)', unit: '新增独立 1%', delta: dps * .01, percent: dps === 0 ? null : 1 }); }
  return rows.sort((a, b) => (b.percent ?? -Infinity) - (a.percent ?? -Infinity) || b.delta - a.delta);
}
