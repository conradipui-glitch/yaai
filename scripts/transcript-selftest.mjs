import assert from 'node:assert/strict';
import {
  buildTranscriptEvidence, makeTranscriptRecord, parseCaptionText,
  transcriptChunks, videoIdFromContent,
} from '../lib/youtube-transcripts.mjs';
import { createDistributionDataset, createEntity, createContentItem } from '../lib/source-adapter.mjs';

const entity=createEntity({platform:'youtube',type:'channel',externalId:'channel-1',name:'Creator'});
const item=createContentItem({
  platform:'youtube',type:'video',externalId:'4mkUoy7PM5Q',entityId:entity.id,
  url:'https://www.youtube.com/watch?v=4mkUoy7PM5Q',title:'Cheap evaluation video',
});
const distribution=createDistributionDataset({
  source:'fixture',platform:'youtube',entities:[entity],contentItems:[item],
});
assert.equal(videoIdFromContent(item),'4mkUoy7PM5Q');

const vtt=parseCaptionText('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello <b>world</b>\n\n00:00:04.000 --> 00:00:05.500\nGo to Telegram!', 'vtt');
assert.equal(vtt.length,2);
assert.equal(vtt[0].start,1);
assert.equal(vtt[1].duration,1.5);
assert.equal(vtt[0].text,'Hello world');

const srt=parseCaptionText('1\n00:00:01,000 --> 00:00:02,500\nFirst line\n\n2\n00:00:03,000 --> 00:00:04,000\nSecond line', 'srt');
assert.equal(srt.length,2);
assert.equal(srt[0].text,'First line');

const md=parseCaptionText('## [00:01](https://www.youtube.com/watch?v=4mkUoy7PM5Q&t=1s)\nThis is a transcript\n\n**[01:20]** Another part about a free guide.', 'md');
assert.equal(md.length,2);
assert.equal(md[0].start,1);
assert.equal(md[1].start,80);
assert.match(md[1].text,/free guide/);

const txt=parseCaptionText('Hello\n  YouTube\n', 'txt');
assert.equal(txt[0].text,'Hello YouTube');

const record=makeTranscriptRecord({item,segments:md,source:'local-md',language:'ru'});
assert.equal(record.status,'ok');
assert.match(record.textHash,/^[a-f0-9]{64}$/);
const evidence=buildTranscriptEvidence(distribution,[record]);
assert.equal(evidence.summary.usable,1);
assert.equal(evidence.transcripts[0].contentId,item.id);
const chunks=transcriptChunks(record,500,12);
assert.equal(chunks.length,1);
assert.equal(chunks[0].startSeconds,1);
assert.match(chunks[0].text,/free guide/);

const long=makeTranscriptRecord({item,segments:[{start:0,duration:200,text:'Long analysis. '.repeat(200)}],source:'fixture'});
const split=transcriptChunks(long,500,20);
assert.ok(split.length>2);
assert.throws(()=>transcriptChunks(long,500,1),/exceeding/);
assert.throws(()=>buildTranscriptEvidence(distribution,[record,record]),/Duplicate/);
const missing=makeTranscriptRecord({item,source:'local',status:'missing',reason:'not found'});
assert.equal(missing.status,'missing');
assert.equal(missing.text,'');
console.log('youtube transcript selftest: ok');
