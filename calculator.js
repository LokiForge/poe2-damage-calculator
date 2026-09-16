export const defaults = {base:1000,added:0,inc:200,rate:1,crit:5,bonus:100,more:[{name:'独立倍率 1',value:30}]};
export function validate(s){
 for(const k of ['base','added','inc','rate','crit','bonus']) if(typeof s[k]!=='number'||!Number.isFinite(s[k])) throw Error('请填写有效数字');
 if(s.base<0||s.added<0||s.inc< -100||s.rate<0||s.crit<0||s.crit>100||s.bonus<0) throw Error('输入超出允许范围');
 if(!Array.isArray(s.more)||s.more.length>50||s.more.some(m=>typeof m.name!=='string'||!Number.isFinite(m.value)||m.value< -100)) throw Error('More 倍率无效');
}
export function calculate(s){validate(s);const more=s.more.reduce((a,m)=>a*(1+m.value/100),1);const hit=(s.base+s.added)*(1+s.inc/100)*more;const average=hit*(1+s.crit/100*s.bonus/100);const dps=average*s.rate;if(!Number.isFinite(dps))throw Error('数值过大，请降低输入');return {hit,average,dps,more};}
export function marginal(s){const current=calculate(s).dps;const items=[['base','技能基础伤害','+1 点'],['added','附加基础伤害','+1 点'],['inc','Increased 增伤','+1 个百分点'],['rate','每秒命中次数','+1 次/秒'],['crit','最终暴击率','+1 个百分点'],['bonus','最终暴击伤害加成','+1 个百分点']].map(([key,name,unit])=>({name,unit,change:d=>{d[key]=key==='crit'?Math.min(100,d[key]+1):d[key]+1;}}));s.more.forEach((m,i)=>items.push({name:m.name||`独立倍率 ${i+1}`,unit:'+1 个百分点（已有 More）',change:d=>d.more[i].value++}));items.push({name:'新增独立 More',unit:'新增 ×1.01 倍率',change:null});return items.map(({name,unit,change})=>{const next=structuredClone(s);if(change)change(next);const delta=change?calculate(next).dps-current:current*0.01;return {name,unit,delta,percent:current===0?null:delta/current*100};});}
