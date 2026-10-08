import fs from 'node:fs/promises';
import { parseCaptionText, makeTranscriptRecord, transcriptChunks } from '../lib/youtube-transcripts.mjs';
import { evaluateItemsWithJev } from '../lib/evaluation.mjs';
import { resolveOpenRouterApiKey } from '../lib/jev.mjs';

const apiKey=resolveOpenRouterApiKey();
if(!apiKey) throw new Error('YAIS_AI is required for live transcript smoke.');
const profile=JSON.parse(await fs.readFile('examples/evaluation-profiles/transcript-intelligence.json','utf8'));

// Explicitly synthetic sample: live model/API contract test, not a claim about a real creator.
const item={id:'youtube:video:4mkUoy7PM5Q',externalId:'4mkUoy7PM5Q',platform:'youtube',type:'video',
  url:'https://www.youtube.com/watch?v=4mkUoy7PM5Q',title:'Cheap classification and offer research'};
const captions=parseCaptionText('## [00:01](https://youtube.com/watch?v=4mkUoy7PM5Q&t=1s)\nВ видео показан способ дешёвой оценки отзывов клиентов с помощью модели классификации.\n\n## [01:10](https://youtube.com/watch?v=4mkUoy7PM5Q&t=70s)\nАвтор приглашает скачать бесплатный гайд из его Telegram-канала и написать ему за консультацией по внедрению автоматизации.', 'md');
const transcript=makeTranscriptRecord({item,segments:captions,source:'synthetic-smoke'});
const chunks=transcriptChunks(transcript,5000,2);
const data=await evaluateItemsWithJev({
  apiKey,profile,
  items: chunks.map(c=>({
    id:item.id+'#'+c.index,
    state:{title:item.title,transcriptExcerpt:c.text},
    meta:{videoId:item.externalId,startSeconds:c.startSeconds},
  })),
});
const answers=data.evaluations[0].answers;
for(const name of ['content_role','offer_present','pain_present','cta_present','funnel_present','monetization','actionable']) {
  if(!answers[name]) throw new Error('Missing Jev answer: '+name);
}
console.log(JSON.stringify({
  ok:true,fixture:'synthetic',
  model:data.evaluations[0].model,
  provider:data.evaluations[0].provider,
  answers:Object.fromEntries(Object.entries(answers).map(([id,a])=>[id,{type:a.type,value:a.value,certainty:a.certainty}])),
  measuredCostUsd:data.summary.totalCost,
},null,2));
