/**
 * YA AI Knowledge Layer v1: pure, browser/Node-compatible example math.
 * Only illustrates aggregate CTR and conversion rate. Never predicts
 * whether the independent engine's conservative Wilson rules will fire.
 */
const MAX_COUNT=1_000_000_000;
function count(value,label){
  if(typeof value!=='number'||!Number.isSafeInteger(value)||
     value<0||value>MAX_COUNT)throw Error('Введите целое неотрицательное число для «'+label+'» (до 1 млрд).');
  return value;
}
function week(weekData,caption){
  if(!weekData||typeof weekData!=='object')throw Error('Заполните данные '+caption+' недели.');
  const impressions=count(weekData.impressions,caption+' — показы');
  const clicks=count(weekData.clicks,caption+' — клики');
  const conversions=count(weekData.conversions,caption+' — конверсии');
  if(clicks>impressions)throw Error('Кликов не может быть больше показов ('+caption+').');
  if(conversions>clicks)throw Error('Конверсий не может быть больше кликов ('+caption+').');
  return {
    impressions,clicks,conversions,
    ctr:impressions===0?null:clicks/impressions,
    cvr:clicks===0?null:conversions/clicks,
  };
}
const relative=(before,after)=>before===null||after===null||before===0
  ?null:after/before-1;

export function calculateKnowledgeExample({baseline,current}={}){
  const a=week(baseline,'прошлой');
  const b=week(current,'текущей');
  return {
    baseline:a,current:b,
    ctrRelativeChange:relative(a.ctr,b.ctr),
    cvrRelativeChange:relative(a.cvr,b.cvr),
    note:'Учебная арифметика. Не оценивает достоверность исходных данных, статистическую значимость, атрибуцию или причину изменений.',
  };
}
