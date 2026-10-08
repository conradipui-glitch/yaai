#!/usr/bin/env node
/**
 * Offline-only report derived from a previously collected Omsk Pain Discovery run.
 * Never contacts external APIs or invents model-reviewed human labels.
 */
import fs from "node:fs/promises";
import path from "node:path";

const [inputDir,outputFile]=process.argv.slice(2);
if(!inputDir||!outputFile)throw new Error("Usage: node scripts/report-omsk-pain-pilot.mjs <artifacts-dir> <report.md>");
const topics=[
  ["roofing","Кровельные работы"],
  ["screed","Полусухая стяжка"],
  ["facades","Фасадные работы"],
];
const lines=[
 "# Омск — реальные поисковые сигналы и ограничения Pain Discovery",
 "",
 "Источник: Yandex Wordstat TopRequests + Yandex Search API (регион Омская область, проверенный ID 11318) + Jev.",
 "Сбор: https://github.com/conradipui-glitch/yaai/actions/runs/37803639247",
 "",
 "Это рабочие наблюдения, **не** отзывы клиентов. SERP выдаёт фрагменты страниц, а Jev не подтверждает их правдивость.",
 "Поисковая частотность может пересекаться и не равна заявкам или размеру рынка.",
 ""
];
const bad=/проблем|ошиб|трещ|теч|протек|почему|ремонт|дорог|цена|стоим|расцен|расход|дефект|отсло|срок|нельзя|передел|влаг/i;
for(const [code,title] of topics){
  const folder=path.join(inputDir,"omsk-pain-"+code);
  const read=async name=>JSON.parse(await fs.readFile(path.join(folder,name),"utf8"));
  const [wordstat,serp,map,quality,review]=await Promise.all([
    read("wordstat.json"),read("serp.json"),read("pain-map.json"),read("quality.json"),read("review-unlabeled.json")
  ]);
  if(map.topic.length<3||!Array.isArray(map.evidenceLedger)||serp.queries.length!==2)throw new Error("Unexpected source shape for "+code);
  if(review.items.some(x=>x.label.isPain!==null)||quality.status!=="insufficient_manual_labels")throw new Error("Human-review claims must remain pending: "+code);
  lines.push("## "+title,"");
  lines.push("- Wordstat: "+wordstat.rows.length+" фраз (в том числе топ и ассоциации), "+wordstat.calls.length+" исходных запросов");
  lines.push("- SERP: "+serp.queries.length+" заданных запроса, "+serp.queries.reduce((n,q)=>n+q.results.length,0)+" фрагментов");
  lines.push("- Jev: "+map.input.classifiedCount+" классификаций; принятых проблем: "+map.summary.acceptedEvidence+
    "; оценённая стоимость Jev: $"+map.summary.measuredModelCostUsd);
  lines.push("- Quality Gate: "+quality.status+"; человеческих оценок: "+quality.sample.labeled+"/"+review.items.length,
    "",
    "### Формулировки Wordstat (наблюдаемые, без сложения частот)",
    "");
  const withSignal=wordstat.rows
    .filter(r=>bad.test(r.phrase||""))
    .sort((a,b)=>(b.count??-1)-(a.count??-1))
    .slice(0,12);
  if(!withSignal.length)lines.push("Не выделены по контрольным признакам.");
  for(const r of withSignal){
    lines.push("- «"+String(r.phrase).replaceAll("\n"," ")+"» — "+(r.count??"значение не передано")+" (тип: "+r.types.join("/")+")");
  }
  lines.push("","### Проверенные запросы выдачи и обнаруженные фрагменты","");
  for(const q of serp.queries){
    lines.push("**Запрос:** «"+q.query+"»","");
    for(const item of q.results.slice(0,5)){
      const title=String(item.title||"").replace(/\s+/g," ").slice(0,135);
      const url=String(item.url||"").trim();
      const passage=String(item.passage||"").replace(/\s+/g," ").slice(0,230);
      lines.push("- "+title+" — "+url);
      if(passage)lines.push("  - Фрагмент Яндекса: «"+passage+"»");
    }
    lines.push("");
  }
  lines.push("### Неотфильтрованные решения Jev (для ручной проверки)","");
  for(const row of map.evidenceLedger){
    const cls=row.classification||{};
    lines.push("- ["+row.kind+"] "+String(row.query||row.title||"").replace(/\s+/g," ").slice(0,130)+
      " — признана проблемой: "+Boolean(cls.accepted)+
      "; категория: "+(cls.category??"нет")+
      "; голос: "+(cls.voice??"нет")+
      "; вероятность: "+(cls.painProbability??"не определена"));
  }
  lines.push("","**Вывод по направлению:** Jev не подтвердил проблемных свидетельств по строгому порогу; формулировки Wordstat и фрагменты SERP остаются кандидатами для FAQ после проверки специалистом и реальными обращениями.","");
}
lines.push(
"## Редакторское решение",
"",
"Не писать «жители Омска боятся/жалуются» и не приписывать отдельным коммерческим страницам доказанные боли по этому исследованию.",
"На основе непосредственно наблюдаемых вопросов разрешается подготовить **предварительный список тем FAQ** с ссылкой на первичный источник и технической проверкой; на сайт публиковать только проверенные технологические факты.",
"Не включать автоматическую сезонность по сигналам Pain Map. Сезонность Wordstat 2024–2025 исследована отдельно и остаётся предварительной.",
"",
"Не измеренные пока метрики: качество классификации Jev (precision/recall), качество реальных обращений, конверсия и рентабельность.",
""
);
await fs.mkdir(path.dirname(outputFile),{recursive:true});
await fs.writeFile(outputFile,lines.join("\n"),"utf8");
console.log("OMSK_SOURCE_REVIEW_REPORT_START");
console.log(lines.join("\n").slice(0,46000));
console.log("OMSK_SOURCE_REVIEW_REPORT_END");
