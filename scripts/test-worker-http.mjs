import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const endpoints = ['http://127.0.0.1:8787','http://127.0.0.1:5173'];
const report = [];
for (const endpoint of endpoints) {
  const healthResponse = await fetch(`${endpoint}/api/health`);
  assert.equal(healthResponse.status,200);
  const health = await healthResponse.json();
  assert.equal(health.mode,'fixture'); assert.equal(health.aiBinding,false);
  for (const question of health.fixtureQuestions) {
    const response = await fetch(`${endpoint}/api/generate`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question})});
    const body = await response.json();
    assert.equal(response.status,200); assert.equal(body.mode,'fixture');
    assert.match(body.executableSql,/LIMIT 501$/);
    report.push({endpoint,question,status:response.status,mode:body.mode,snippetIds:body.snippets.map(item=>item.id)});
  }
  const forbidden = await fetch(`${endpoint}/api/generate`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question:'test',rows:[{fare_amount:42}]})});
  assert.equal(forbidden.status,400); assert.equal((await forbidden.json()).error.code,'UNKNOWN_FIELD');
}
await writeFile('data/worker-fixture-http.json',JSON.stringify({provenance:'local fixture only; no LLM called',report,extraFieldRejections:2},null,2)+'\n');
console.log(`PASS: ${report.length} explicit fixture responses across Worker and Vite proxy; 2 row-payload rejections. No model calls.`);
