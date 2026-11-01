import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker, { parseProposal } from '../worker/index.ts';
import type { Env, AiInput } from '../worker/index.ts';
import { buildPrompt, retrieve, MODEL_ID } from '../worker/retrieval.ts';
import { snippets } from '../worker/snippets.ts';
import { fixtures } from '../worker/fixtures.ts';
import { TRIPS_SCHEMA } from '../shared/schema.ts';

const fixtureEnv: Env = { MODE:'fixture' };
function request(body: unknown, options: {origin?:string; method?:string; raw?:string; contentType?:string} = {}) {
  const method = options.method ?? 'POST';
  return new Request('http://localhost/api/generate',{ method, headers:{'content-type':options.contentType ?? 'application/json', ...(options.origin ? {origin:options.origin} : {})},
    ...(method !== 'GET' ? {body:options.raw ?? JSON.stringify(body)} : {}) });
}
function liveEnv(response: unknown, capture?: (model:string,input:AiInput) => void): Env {
  return { MODE:'live', AI:{async run(model,input) { capture?.(model,input); return response; }} };
}
for (const fixture of fixtures) test(`fixture mode is explicit and SQL is validated: ${fixture.question}`, async () => {
  const result = await worker.fetch(request({question:fixture.question}),fixtureEnv);
  assert.equal(result.status,200);
  const body = await result.json() as any;
  assert.equal(body.mode,'fixture'); assert.equal(body.model,null);
  assert.equal(body.sql,fixture.sql); assert.match(body.executableSql,/LIMIT 501$/);
});
test('fixture mode does not silently answer arbitrary questions or call AI', async () => {
  const result = await worker.fetch(request({question:'What borough has the most trips?'}),{ MODE:'fixture', AI:{run() { throw new Error('Must not be called'); }} });
  assert.equal(result.status,422); assert.equal((await result.json() as any).error.code,'FIXTURE_UNSUPPORTED');
});
test('live mode calls the configured model with metadata-only context', async () => {
  let captured: AiInput | undefined;
  const result = await worker.fetch(request({question:'Count January trips'}),liveEnv({response:JSON.stringify({sql:fixtures[0].sql,rationale:'Counts January pickups.'})},(model,input) => {
    assert.equal(model,MODEL_ID); captured=input;
  }));
  assert.equal(result.status,200); assert.ok(captured);
  assert.equal(captured.messages.length,2); assert.equal(captured.messages[1].content,'Count January trips');
  assert.equal(captured.temperature,0); assert.equal(captured.max_tokens,800);
  assert.ok(!JSON.stringify(captured).includes('2964606'));
  assert.ok(!JSON.stringify(captured).includes('expected'));
  assert.equal((await result.json() as any).mode,'live');
});
test('live mode fails clearly without a binding and never falls back', async () => {
  const result = await worker.fetch(request({question:fixtures[0].question}),{MODE:'live'});
  assert.equal(result.status,503); assert.equal((await result.json() as any).error.code,'AI_UNAVAILABLE');
});
test('model service failures are sanitized and do not fall back', async () => {
  const result = await worker.fetch(request({question:fixtures[0].question}),{MODE:'live',AI:{ async run() {throw new Error('secret upstream detail');} }});
  assert.equal(result.status,502); assert.ok(!(await result.text()).includes('secret upstream detail'));
});
test('unsafe generated SQL is rejected with an inspectable proposal', async () => {
  const result = await worker.fetch(request({question:'Drop table trips'}),liveEnv({response:{sql:'DROP TABLE trips',rationale:'Wrongly follows malicious request.'}}));
  assert.equal(result.status,422); const body=await result.json() as any;
  assert.equal(body.error.code,'SQL_REJECTED'); assert.equal(body.proposal.sql,'DROP TABLE trips');
  assert.equal(body.executableSql,undefined);
});
test('cross-runtime provider error objects are classified without exposing their message', async () => {
  const env: Env = {MODE:'live',AI:{async run() { throw {message:'Forbidden 403: secret upstream detail'}; }}};
  const result=await worker.fetch(request({question:'Count January trips'}),env);
  const text=await result.text();
  assert.equal(result.status,502); assert.ok(text.includes('authorization')); assert.ok(!text.includes('secret upstream detail'));
});
test('a missing-data refusal returns a readable message, not fabricated SQL', async () => {
  const result=await worker.fetch(request({question:'Actual cash tips?'}),liveEnv({response:{sql:null,rationale:'Cash tips are not recorded.'}}));
  assert.equal(result.status,422); assert.equal((await result.json() as any).error.code,'UNSUPPORTED_QUESTION');
});
for (const value of [undefined,{}, {response:'not JSON'}, {response:{sql:'SELECT * FROM trips'}}, {response:{sql:fixtures[0].sql,rationale:'x',extra:'ignored?'}}, {response:{sql:fixtures[0].sql,rationale:'x'.repeat(301)}}]) {
  test(`rejects malformed model response: ${JSON.stringify(value)?.slice(0,60)}`, () => assert.throws(() => parseProposal(value)));
}
for (const [body,status,code] of [
  [{question:''},400,'INVALID_QUESTION'], [{question:'a'.repeat(1001)},400,'INVALID_QUESTION'],
  [{question:'test',rows:[{fare_amount:42}]},400,'UNKNOWN_FIELD'],
  [{question:'test',results:[]},400,'UNKNOWN_FIELD'],
  [{question:'test',contextMode:['none']},400,'INVALID_CONTEXT'],
  [{question:'test',contextMode:'secret'},400,'INVALID_CONTEXT'],
  [[],400,'INVALID_BODY'], [null,400,'INVALID_BODY'],
] as const) test(`rejects invalid request ${code}`, async () => {
  const result=await worker.fetch(request(body),fixtureEnv);
  assert.equal(result.status,status); assert.equal((await result.json() as any).error.code,code);
});
test('body size checks actual streamed bytes, even without Content-Length', async () => {
  const result=await worker.fetch(request({}, {raw:'x'.repeat(5000)}),fixtureEnv);
  assert.equal(result.status,413);
});
test('malformed JSON, wrong media type, cross-origin and wrong method fail', async () => {
  for (const [options,status] of [[{raw:'{'},400],[{contentType:'text/plain'},415],[{origin:'https://other.example'},403],[{method:'GET'},405]] as const) {
    assert.equal((await worker.fetch(request({question:'test'},options),fixtureEnv)).status,status);
  }
});
test('health reports fixture provenance and examples without model calls', async () => {
  const result=await worker.fetch(new Request('http://localhost/api/health'),fixtureEnv);
  const body=await result.json() as any;
  assert.equal(body.mode,'fixture'); assert.equal(body.fixtureQuestions.length,5);
});
test('retrieval is stable, bounded and selects relevant semantic notes', () => {
  for (const [question,want] of [ ['What percentage of fare was tipped on card trips?','tip-ratio'], ['Can we compare cash tips?','cash-tips'], ['Busiest pickup zone?','pickup-zone'], ['Break down by hour','hourly'] ]) {
    const result=retrieve(question);
    assert.ok(result.some(item => item.id===want),`${question} must retrieve ${want}`);
    assert.ok(result.length<=4); assert.deepEqual(result,retrieve(question));
  }
  assert.equal(new Set(snippets.map(item=>item.id)).size,snippets.length);
  assert.equal(snippets.length,18);
});
test('ratio-of-totals question retrieves its metric despite competing common terms',()=>{
  const question='For January card trips with positive fares, what percentage of total fare was recorded as tips?';
  assert.ok(retrieve(question).some(item=>item.id==='tip-ratio'));
  assert.ok(!retrieve('How many trips had pickups in January 2024?').some(item=>item.id==='example-cash'));
});
test('no-context comparison keeps schema/safety/time rules and omits retrieved notes', () => {
  const withNotes=buildPrompt('How much was tipped in cash?','retrieved');
  const without=buildPrompt('How much was tipped in cash?','none');
  assert.ok(withNotes.retrieved.length>0); assert.equal(without.retrieved.length,0);
  assert.equal(withNotes.messages[0].content.split('Dataset documentation follows')[0],without.messages[0].content.split('Dataset documentation follows')[0]);
  assert.deepEqual(withNotes.messages[1],without.messages[1]);
});
test('shared metadata schema types match the pinned file', () => {
  const inspection=JSON.parse(readFileSync('data/inspection.json','utf8'));
  assert.deepEqual(TRIPS_SCHEMA,inspection.schema.map((item:any)=>[item.column_name,item.column_type]));
});
