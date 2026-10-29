// Real Chromium browser QA for the independent-review offline HTML.
// Run only from a dedicated CI workflow with Playwright installed in the runner.
// This test does NOT impersonate or certify a human reviewer.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {makeBlindPack,inspectReview} from '../lib/operator-blind-review.mjs';

const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const repo=path.resolve(new URL('..',import.meta.url).pathname);
const bundle=path.resolve(process.argv[2]||'dist/P0-B.4-offline-review.html');
const output=path.resolve(process.argv[3]||'dist/reviewer-browser-qa');
await fs.mkdir(output,{recursive:true});
const raw=await fs.readFile(path.join(repo,'playbooks/operator-local-smb-diagnostic-v0/fixtures/p0-b4-reference-candidates.json'),'utf8');
const blind=makeBlindPack(JSON.parse(raw),raw);
const executablePath=process.env.CHROME_PATH||undefined;
const browser=await chromium.launch({headless:true,
 ...(executablePath?{executablePath}:{channel:'chrome'}),
 args:['--no-sandbox']});
const errors=[],requests=[];
try{
  const context=await browser.newContext({viewport:{width:1365,height:900},acceptDownloads:true});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',req=>{if(/^https?:/i.test(req.url()))requests.push(req.url());});
  await page.goto(pathToFileURL(bundle).href,{waitUntil:'load'});
  await page.waitForSelector('#workspace:not([hidden])',{timeout:10000});
  assert.match(await page.locator('#load-status').innerText(),/Загружены 19/);
  assert.equal(await page.locator('#case-list button').count(),19);
  assert.equal(await page.locator('#progress-count').innerText(),'0 / 19');
  assert.equal(await page.locator('#review-input').isDisabled(),false);
  assert.equal(await page.locator('#human').isChecked(),false);
  assert.equal(await page.locator('#independent').isChecked(),false);
  assert.equal(await page.locator('#blind-confirm').isChecked(),false);
  await page.screenshot({path:path.join(output,'desktop-first-case.png'),fullPage:true});
  await page.locator('input[name="decision"][value="propose_draft"]').check();
  await page.locator('input[data-evidence]').first().check();
  await page.locator('input[data-evidence]').nth(1).check();
  await page.locator('#reason').fill('В примере есть доступное наблюдение о неработающем переходе к заявке.');
  await page.locator('#alternative').fill('Может работать независимый от кнопки телефонный канал связи.');
  await page.locator('#next-check').fill('Перепроверить код HTTP и конечный адрес ссылки в браузере.');
  await page.locator('#proposed-action').fill('Проверить и исправить переход к заявке после подтверждения.');
  await page.locator('#save-case').click();
  assert.equal(await page.locator('#progress-count').innerText(),'1 / 19');

  const dl=page.waitForEvent('download');
  await page.locator('#export-review').click();
  const download=await dl;
  const savedPath=path.join(output,'TEST-ONLY-review.json');
  await download.saveAs(savedPath);
  const saved=JSON.parse(await fs.readFile(savedPath,'utf8'));
  assert.equal(saved.entries.length,1);
  assert.equal(saved.entries[0].caseId,'s01');
  assert.deepEqual(saved.entries[0].evidenceIds,['a','b']);
  assert.equal(saved.reviewer.isHuman,false);
  assert.equal(inspectReview(blind,saved).readyForAdjudication,false);
  // A human must still make and attest all 19 decisions.
  await page.reload();
  await page.waitForSelector('#workspace:not([hidden])');
  assert.equal(await page.locator('#progress-count').innerText(),'0 / 19',
    'Nothing must persist in browser storage');
  await page.locator('#review-input').setInputFiles(savedPath);
  assert.equal(await page.locator('#progress-count').innerText(),'1 / 19');
  await page.locator('#case-list button').nth(18).click();
  assert.match(await page.locator('#case-index').innerText(),/19 из 19/i);
  assert.equal(await page.locator('#sources a').count(),1);
  const publicURL=await page.locator('#sources a').first().getAttribute('href');
  assert.match(publicURL,/^https:/);
  await page.screenshot({path:path.join(output,'desktop-last-case.png'),fullPage:true});

  const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
  const m=await mobile.newPage();
  m.on('pageerror',e=>errors.push(e.message));
  await m.goto(pathToFileURL(bundle).href,{waitUntil:'load'});
  await m.waitForSelector('#workspace:not([hidden])');
  await m.screenshot({path:path.join(output,'mobile-first-case.png'),fullPage:true});
  const width=await m.evaluate(()=>({document:document.documentElement.scrollWidth,viewport:innerWidth}));
  assert.ok(width.document<=width.viewport+2,
    'Mobile horizontal overflow detected: '+JSON.stringify(width));
  assert.equal(await m.locator('#case-list button').count(),19);
  assert.equal(await m.locator('#load-status').getAttribute('role'),'status');
  assert.deepEqual(errors,[],'Browser JavaScript console errors');
  assert.deepEqual(requests,[],'Unexpected remote HTTP requests');
  console.log(JSON.stringify({result:'PASS',browsers:['Chromium desktop','Chromium mobile viewport'],
    caseCount:19,reviewEntriesAfterReload:1,noModelAnswers:true,noNetworkRequests:true,
    browserErrors:errors.length,mobileWidth:width,
    screenshots:['desktop-first-case.png','desktop-last-case.png','mobile-first-case.png'],
    independentHumanReview:'NOT RUN'},null,2));
}finally{await browser.close();}
