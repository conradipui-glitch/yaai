import crypto from 'node:crypto';
import { PAIN_CATEGORIES } from './pain-discovery.mjs';

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function round(x) { return Math.round(x * 10000) / 10000; }
function ratio(a, b) { return b ? round(a / b) : null; }

export function painMapFingerprint(map) {
  if (map?.source !== 'yaai-pain-discovery' || !Array.isArray(map.evidenceLedger)) {
    throw new Error('Expected Pain Map with complete evidenceLedger (Pain Discovery quality-ready format). Re-run pain:analyze on original evidence.');
  }
  const ids = map.evidenceLedger.map(row => row.id);
  if (ids.length !== new Set(ids).size) throw new Error('Pain Map evidenceLedger has duplicate IDs.');
  const keys = map.evidenceLedger.map(row => ({
    id:row.id, kind:row.kind, query:row.query, excerpt:row.excerpt, url:row.url,
    prediction:row.classification?.accepted, category:row.classification?.category,
    modelCostUsd:row.classification?.modelCostUsd,
  })).sort((a,b)=>a.id.localeCompare(b.id));
  return digest(keys);
}

function strata(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = (row.kind || 'unknown') + ':' + (row.classification?.accepted ? 'predicted-pain' : 'predicted-not-pain');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  for (const batch of groups.values()) batch.sort((a,b)=>digest(a.id).localeCompare(digest(b.id)));
  return groups;
}

export function preparePainReview(map, { sampleSize = 100 } = {}) {
  const mapFingerprint = painMapFingerprint(map);
  if (!Number.isInteger(sampleSize) || sampleSize < 1 || sampleSize > 500) throw new Error('sampleSize must be 1–500.');
  const groups = strata(map.evidenceLedger);
  const keys = [...groups.keys()].sort();
  const selected = [], selectedStrata = {};
  // Round-robin across source types AND predicted decisions, so rejected candidates are also reviewed.
  while (selected.length < sampleSize) {
    let added = false;
    for (const key of keys) {
      const row = groups.get(key).shift();
      if (!row) continue;
      selected.push(row);
      selectedStrata[key] = (selectedStrata[key] || 0) + 1;
      added = true;
      if (selected.length >= sampleSize) break;
    }
    if (!added) break;
  }
  return {
    schemaVersion:1,
    source:'yaai-pain-human-review',
    topic:map.topic,
    createdAt:new Date().toISOString(),
    mapFingerprint,
    sampling:{
      strategy: 'deterministic-prediction-and-source-stratified',
      populationCount:map.evidenceLedger.length,
      sampledCount:selected.length,
      countsByStratum:selectedStrata,
      warning:'Sample is stratified, not a random population sample. Results cannot be extrapolated to prevalence without weighting.',
    },
    instruction:'Fill label.isPain (true/false), label.category when true, label.evidenceSupported (true/false), and label.reviewer. Leave null for unreviewed rows. Check the original source where possible.',
    items:selected.map(row=>({
      id:row.id,
      // Reviewer receives original evidence only: no model prediction shown to avoid anchoring.
      evidence:{
        kind:row.kind,query:row.query,title:row.title,excerpt:row.excerpt,
        url:row.url,region:row.region,observedCount:row.observedCount,
        sourceGeneratedAt:row.sourceGeneratedAt,note:row.note,
      },
      label:{isPain:null,category:null,evidenceSupported:null,reviewer:'',notes:''},
    })),
  };
}

function completedLabel(row) {
  const label = row?.label || {};
  if (label.isPain === null || label.isPain === undefined) return false;
  if (typeof label.isPain !== 'boolean') throw new Error('label.isPain must be true, false, or null for ' + row.id);
  if (!['string'].includes(typeof label.reviewer) || !label.reviewer.trim()) {
    throw new Error('Reviewed row must have a human reviewer name: ' + row.id);
  }
  if (typeof label.evidenceSupported !== 'boolean') throw new Error('Reviewed row needs boolean evidenceSupported: ' + row.id);
  if (label.isPain) {
    if (!Object.hasOwn(PAIN_CATEGORIES,label.category) || label.category === 'none') {
      throw new Error('Positive human labels require a valid non-none pain category: ' + row.id);
    }
  } else if (label.category != null && label.category !== 'none') {
    throw new Error('Negative human label must use category none or null: ' + row.id);
  }
  if (label.evidenceSupported && !label.isPain) {
    throw new Error('Evidence cannot support a pain when human label says no pain: ' + row.id);
  }
  return true;
}

export function evaluatePainQuality(map, review, { targetLabels = 50 } = {}) {
  const fingerprint = painMapFingerprint(map);
  if (review?.source !== 'yaai-pain-human-review' || !Array.isArray(review.items)) throw new Error('Expected a human Pain Review JSON.');
  if (review.mapFingerprint !== fingerprint) throw new Error('Review labels are for a different or modified Pain Map.');
  if (!Number.isInteger(targetLabels) || targetLabels < 1 || targetLabels > 500) throw new Error('targetLabels must be 1–500.');
  const byId = new Map(map.evidenceLedger.map(row=>[row.id,row]));
  const seen = new Set(), rows = [];
  for (const item of review.items) {
    if (seen.has(item.id)) throw new Error('Duplicate review item ID: ' + item.id);
    seen.add(item.id);
    const source = byId.get(item.id);
    if (!source) throw new Error('Review item has no matching source observation: ' + item.id);
    if (!completedLabel(item)) continue;
    rows.push({ source, label:item.label });
  }

  let tp=0,fp=0,tn=0,fn=0,validatedEvidence=0,categoryCorrect=0;
  let modelCost=0, knownCostRows=0;
  const bySource = {};
  const discrepancies = [];
  for (const {source,label} of rows) {
    const prediction = source.classification || {};
    const predicted = prediction.accepted === true;
    const truth = label.isPain;
    if (predicted && truth) tp++;
    else if (predicted && !truth) fp++;
    else if (!predicted && truth) fn++;
    else tn++;
    if (predicted && label.evidenceSupported) validatedEvidence++;
    if (predicted && truth && prediction.category === label.category) categoryCorrect++;
    if (typeof prediction.modelCostUsd === 'number' && Number.isFinite(prediction.modelCostUsd)) {
      modelCost += prediction.modelCostUsd;
      knownCostRows++;
    }
    const name = source.kind || 'unknown';
    const counts = bySource[name] || {reviewed:0,tp:0,fp:0,tn:0,fn:0};
    counts.reviewed++;
    if (predicted && truth) counts.tp++;
    else if (predicted && !truth) counts.fp++;
    else if (!predicted && truth) counts.fn++;
    else counts.tn++;
    bySource[name] = counts;
    if (predicted !== truth || (predicted && truth && prediction.category !== label.category)) {
      discrepancies.push({
        id:source.id,sourceType:name,url:source.url,query:source.query,
        predictedPain:predicted,humanPain:truth,
        predictedCategory:prediction.category,humanCategory:label.category,
        evidenceSupported:label.evidenceSupported,notes:label.notes || '',
      });
    }
  }
  const complete = rows.length >= targetLabels && tp+fn>=5 && tn+fp>=5;
  const costReady = knownCostRows === rows.length && rows.length>0;
  return {
    schemaVersion:1, source:'yaai-pain-quality-report',
    generatedAt:new Date().toISOString(), topic:map.topic,
    mapFingerprint:fingerprint,
    status:complete?'provisional_human_benchmark':'insufficient_manual_labels',
    sample:{
      population:review.sampling?.populationCount ?? map.evidenceLedger.length,
      queued:review.items.length,labeled:rows.length,pending:review.items.length-rows.length,
      target:targetLabels,
      method:review.sampling?.strategy || 'unknown',
      observedPositive:tp+fn,observedNegative:tn+fp,
      warning:'Stratified or incomplete annotations describe only reviewed items, not all audience demand.',
    },
    confusion:{truePositive:tp,falsePositive:fp,trueNegative:tn,falseNegative:fn},
    metrics:{
      painPrecision:ratio(tp,tp+fp),
      painRecall:ratio(tp,tp+fn),
      categoryAccuracyOnTruePositive:ratio(categoryCorrect,tp),
      validatedEvidenceCoverage:ratio(validatedEvidence,tp+fp),
      humanPositiveCount:tp,
      sourceSupportedTruePositiveCount:validatedEvidence,
      costPerHumanPositiveUsd:costReady && tp>0 ? round(modelCost/tp, 8) : null,
      costPerSourceSupportedTruePositiveUsd:costReady && validatedEvidence>0 ? round(modelCost/validatedEvidence, 8) : null,
      // Kept for older JSON consumers, now correctly uses source-supported TP.
      costPerValidatedTruePositiveUsd:costReady && validatedEvidence>0 ? round(modelCost/validatedEvidence, 8) : null,
      reviewedJevCostUsd:costReady ? round(modelCost, 8) : null,
    },
    sources:bySource, discrepancies,
    limitations:[
      'Human reviewer must verify labels independently; unreviewed rows never count as truth.',
      'Precision/recall refer to the reviewed sample, not general market prevalence or all search results.',
      'Label selection stratifies by prediction and source; comparisons between versions require the same reviewed set.',
      'validatedEvidenceCoverage is human-judged source support among predicted positive rows.',
      'Cost per verified pain divides measured Jev cost by human true positives whose original source also supports the pain; excludes Yandex API costs and reviewer time.',
      'No ground-truth scores are claimed until enough real labels exist.',
    ],
  };
}

export function painQualityMarkdown(result) {
  const n = x => x === null ? 'нет данных' : (x*100).toFixed(1)+'%';
  const m = result.metrics;
  return [
    '# Pain Discovery — проверка качества',
    '',
    'Статус: '+result.status,
    'Тема: '+result.topic,
    'Размечено: '+result.sample.labeled+'/'+result.sample.queued+'; целевой минимум: '+result.sample.target,
    '',
    '| Показатель | Значение |',
    '|---|---:|',
    '| Pain Precision | '+n(m.painPrecision)+' |',
    '| Pain Recall | '+n(m.painRecall)+' |',
    '| Подтверждённость источниками (среди предсказанных болей) | '+n(m.validatedEvidenceCoverage)+' |',
    '| Точность категории (среди верно найденных болей) | '+n(m.categoryAccuracyOnTruePositive)+' |',
    '| Стоимость Jev на одну боль по оценке человека (USD) | '+(m.costPerHumanPositiveUsd ?? 'нет данных')+' |',
    '| Стоимость Jev на одну боль, подтверждённую источником (USD) | '+(m.costPerSourceSupportedTruePositiveUsd ?? 'нет данных')+' |',
    '',
    'Матрица ошибок: TP='+result.confusion.truePositive+', FP='+result.confusion.falsePositive+
    ', TN='+result.confusion.trueNegative+', FN='+result.confusion.falseNegative,
    '',
    '## Что не сошлось с человеческой оценкой',
    ...result.discrepancies.map(r=>'- '+r.id+' — модель: '+(r.predictedPain?'боль':'нет боли')+
      '; человек: '+(r.humanPain?'боль':'нет боли')+'; источник: '+(r.url || r.query)),
    '',
    '## Ограничения',
    ...result.limitations.map(x=>'- '+x),
    '',
  ].join('\n');
}
