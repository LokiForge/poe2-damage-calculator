import {test} from 'node:test';import assert from 'node:assert/strict';import {defaults,calculate,marginal} from '../calculator.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('independent multipliers and critical expected value',()=>{near(calculate({...defaults,more:[{name:'a',value:30},{name:'b',value:20}]}).dps,4914);});
test('inc marginal versus existing and new more',()=>{const rows=marginal(defaults);near(rows[2].percent,1/3);near(rows.at(-2).percent,100/130);near(rows.at(-1).percent,1);});
test('critical chance clamps at 100 percent',()=>{near(marginal({...defaults,crit:100})[4].delta,0);near(marginal({...defaults,crit:99.5})[4].delta,19.5);});
test('zero damage and zero multipliers have defined absolute gains',()=>{const rows=marginal({...defaults,base:0});assert.equal(rows[0].percent,null);assert.ok(rows[0].delta>0);const zero={...defaults,more:[{name:'less',value:-100}]};near(calculate(zero).dps,0);assert.ok(marginal(zero).at(-2).delta>0);});
test('invalid inputs are rejected',()=>{for(const patch of [{base:-1},{inc:-101},{crit:101},{rate:NaN},{more:[{name:'x',value:-101}]}])assert.throws(()=>calculate({...defaults,...patch}));});
