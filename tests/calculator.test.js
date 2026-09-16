import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, calculate, comparePassives, benefit, migrate } from '../calculator.js';
const fresh = patch => ({ ...structuredClone(defaults), ...patch });
const rows = (...values) => values.map(value => ({ name: '', value }));
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
test('gain shares the original base without recursively gaining gained damage', () => {
  const s = fresh({ base: 100, added: rows(20), gain: rows(20, 30), inc: rows(100), more: [], baseCrit: 0 });
  near(calculate(s).gainedBase, 180); near(calculate(s).hit, 360);
});
test('entries add within a more effect, independent effects multiply', () => {
  const s = fresh({ more: [{ name: 'a', entries: rows(20, 10) }, { name: 'b', entries: rows(20) }] });
  near(calculate(s).more, 1.56); near(calculate(s).dps, 4914);
});
test('attack speed increases apply to original attacks per second', () => {
  near(calculate(fresh({ baseRate: 2, speed: rows(20, 30) })).rate, 3);
});
test('critical increases scale base chance; bonus increases scale base bonus', () => {
  const r = calculate(fresh({ baseCrit: 7, critInc: rows(50, 50), baseBonus: 150, bonusInc: rows(20, 30) }));
  near(r.crit, 14); near(r.bonus, 225); near(r.average, r.hit * 1.315);
});
test('official small-node defaults calculate comparable one-point investments', () => {
  const c = Object.fromEntries(comparePassives(fresh()).map(r => [r.key, r]));
  near(c.inc.delta, 136.5); near(c.speed.delta, 122.85); near(c.critInc.delta, 19.5); near(c.bonusInc.delta, 29.25);
  assert.equal(c.inc.rating, 'good'); assert.equal(c.speed.rating, 'neutral'); assert.equal(c.critInc.rating, 'poor');
});
test('critical cap and partial cap do not overvalue chance nodes', () => {
  near(benefit(fresh({ baseCrit: 50, critInc: rows(100) }), 'critInc', 10).delta, 0);
  near(benefit(fresh({ baseCrit: 50, critInc: rows(99) }), 'critInc', 10).delta, 19.5);
});
test('ranking changes for highly increased damage', () => {
  assert.equal(comparePassives(fresh({ inc: rows(1000) }))[0].key, 'speed');
});
test('zero damage does not create misleading green recommendations', () => {
  assert.ok(comparePassives(fresh({ base: 0 })).every(r => r.percent === null && r.rating === 'neutral'));
  assert.ok(benefit(fresh({ base: 0 }), 'added').delta > 0);
});
test('equal positive gains are both recommended', () => {
  const s = fresh({ inc: rows(200), speed: rows(200), passives: { inc: 3, speed: 3, critInc: 0, bonusInc: 0 } });
  assert.equal(comparePassives(s).filter(r => r.rating === 'good').length, 2);
});
test('legacy history migrates without changing DPS', () => {
  const old = { base: 1200, added: 50, inc: 170, rate: 2.4, crit: 38, bonus: 260, more: [{ name: 'old', value: 30 }] };
  const s = migrate(old); near(calculate(s).dps, (1200 + 50) * 2.7 * 1.3 * (1 + .38 * 2.6) * 2.4);
  assert.equal(s.version, 2); assert.equal(s.more[0].name, 'old');
});
test('invalid fields and reductions beyond 100 percent are rejected', () => {
  for (const patch of [{ base: NaN }, { baseRate: -1 }, { baseCrit: 101 }, { gain: rows(-1) }, { inc: rows(-60, -60) }, { passives: { ...defaults.passives, speed: -1 } }]) assert.throws(() => calculate(fresh(patch)));
});
test('empty groups and full groups support marginal calculation', () => {
  near(calculate(fresh({ more: [], inc: [], baseCrit: 0 })).dps, 1000);
  assert.ok(Number.isFinite(benefit(fresh({ inc: rows(...Array(50).fill(1)) }), 'inc').delta));
});
