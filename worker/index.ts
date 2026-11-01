import { buildPrompt, MODEL_ID } from './retrieval.ts';
import { fixtureAnswer, fixtures } from './fixtures.ts';
import { generateMetric } from './semantic.ts';
import { validateSql, SqlValidationError, SQL_MAX_LENGTH } from '../src/sql-validator.ts';

export type AiInput = {
  messages: { role: 'system' | 'user'; content: string }[];
  temperature: number; max_tokens: number;
  response_format: { type: 'json_schema'; json_schema: Record<string, unknown> };
};
export type Env = { MODE?: string; MODEL_ID?: string; FRONTEND_ORIGIN?: string; AI?: { run(model: string, input: AiInput): Promise<unknown> } };
const MAX_BODY_BYTES = 4096;
const MODEL_TIMEOUT_MS = 30_000;
class ApiError extends Error {
  status: number; code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status=status; this.code=code; }
}
function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
async function readQuestion(request: Request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new ApiError(415,'JSON_REQUIRED','Send application/json.');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400,'INVALID_BODY','Send a JSON object with a question.');
  const parts: Uint8Array[] = []; let length=0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) { await reader.cancel(); throw new ApiError(413,'BODY_TOO_LARGE','Request body must be at most 4096 bytes.'); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset=0;
  for (const part of parts) { bytes.set(part,offset); offset += part.byteLength; }
  let body: unknown;
  try { body = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); }
  catch { throw new ApiError(400,'INVALID_JSON','Request body must be valid JSON.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400,'INVALID_BODY','Send a JSON object.');
  const item = body as Record<string, unknown>;
  if (Object.keys(item).some(key => !['question','contextMode'].includes(key))) throw new ApiError(400,'UNKNOWN_FIELD','Only question and optional contextMode are accepted; do not send rows or results.');
  if (typeof item.question !== 'string' || !item.question.trim() || item.question.length > 1000) throw new ApiError(400,'INVALID_QUESTION','Question must contain 1–1000 characters.');
  if (item.contextMode !== undefined && item.contextMode !== 'retrieved' && item.contextMode !== 'none') throw new ApiError(400,'INVALID_CONTEXT','contextMode must be retrieved or none.');
  return { question: item.question.trim(), contextMode: (item.contextMode ?? 'retrieved') as 'retrieved' | 'none' };
}
export function parseProposal(result: unknown) {
  if (!result || typeof result !== 'object' || !('response' in result)) throw new ApiError(502,'MODEL_FORMAT','Model returned no structured response.');
  let value = (result as {response: unknown}).response;
  if (typeof value === 'string') {
    if (value.length > 12_000) throw new ApiError(502,'MODEL_FORMAT','Model response was too large.');
    try { value = JSON.parse(value); } catch { throw new ApiError(502,'MODEL_FORMAT','Model did not return valid JSON.'); }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(502,'MODEL_FORMAT','Model response must be an object.');
  const item = value as Record<string, unknown>;
  if (Object.keys(item).some(key => !['sql','rationale'].includes(key)) ||
      !(item.sql === null || (typeof item.sql === 'string' && item.sql.length > 0 && item.sql.length <= SQL_MAX_LENGTH)) ||
      typeof item.rationale !== 'string' || !item.rationale.trim() || item.rationale.length > 300) {
    throw new ApiError(502,'MODEL_FORMAT','Model must return sql (string or null) and a rationale of at most 300 characters.');
  }
  return { sql: item.sql as string | null, rationale: item.rationale };
}
async function callModel(env: Env, input: AiInput) {
  if (!env.AI) throw new ApiError(503,'AI_UNAVAILABLE','Workers AI binding is unavailable. Sign in with Wrangler or use the explicitly labelled fixture environment.');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      env.AI.run(env.MODEL_ID ?? MODEL_ID,input),
      new Promise<never>((_resolve,reject) => { timer=setTimeout(() => reject(new ApiError(504,'MODEL_TIMEOUT','Model response timed out. No retry was attempted.')),MODEL_TIMEOUT_MS); }),
    ]);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const message = error instanceof Error ? error.message : (error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error));
    const code = message.match(/\b\d{3,5}\b/)?.[0];
    const category = /auth|permission|forbidden|10000|403/i.test(message) ? 'authorization'
      : /quota|limit|neurons|429/i.test(message) ? 'quota or rate limit'
      : /model|schema|format|parameter/i.test(message) ? 'model or request configuration' : 'service';
    throw new ApiError(502,'MODEL_UNAVAILABLE',`Workers AI ${category} failure${code ? ` (provider code ${code})` : ''}. Check login, model access, and the free allowance. No fixture fallback was used.`);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const mode = env.MODE ?? 'live';
      if (!['fixture','live'].includes(mode)) throw new ApiError(503,'CONFIGURATION','MODE must be live or fixture.');
      if (url.pathname === '/api/health' && request.method === 'GET') return response({ mode, model: mode === 'live' ? env.MODEL_ID ?? MODEL_ID : null, aiBinding: Boolean(env.AI), fixtureQuestions: mode === 'fixture' ? fixtures.map(item => item.question) : [] });
      if (!['/api/generate','/api/metrics'].includes(url.pathname)) throw new ApiError(404,'NOT_FOUND','API route not found.');
      if (request.method !== 'POST') throw new ApiError(405,'METHOD_NOT_ALLOWED','Use POST for SQL generation.');
      const origin = request.headers.get('origin');
      if (origin && origin !== (env.FRONTEND_ORIGIN ?? 'http://127.0.0.1:5173')) throw new ApiError(403,'ORIGIN_REJECTED','Request origin is not allowed.');
      const { question, contextMode } = await readQuestion(request);
      if (url.pathname === '/api/metrics') {
        if (contextMode === 'none') throw new ApiError(400,'INVALID_CONTEXT','Defined metrics always use the fixed catalog.');
        const result = await generateMetric(question,env,callModel);
        return response(result.body,result.status);
      }
      const { messages, retrieved } = buildPrompt(question,contextMode);
      let proposal;
      if (mode === 'fixture') {
        const fixture = fixtureAnswer(question);
        if (!fixture) throw new ApiError(422,'FIXTURE_UNSUPPORTED','Fixture mode supports only the example questions listed by /api/health. No model was called.');
        proposal = { sql: fixture.sql, rationale: fixture.rationale };
      } else {
        const result = await callModel(env,{ messages, temperature:0, max_tokens:800,
          response_format: { type:'json_schema', json_schema:{ type:'object', properties:{sql:{type:['string','null']},rationale:{type:'string'}},required:['sql','rationale'],additionalProperties:false } },
        });
        proposal = parseProposal(result);
      }
      const metadata = { mode, model: mode === 'live' ? env.MODEL_ID ?? MODEL_ID : null, contextMode, snippets: retrieved.map(({id,text,score}) => ({id,text,score})) };
      if (proposal.sql === null) return response({ ...metadata, error:{code:'UNSUPPORTED_QUESTION',message:proposal.rationale} },422);
      try {
        const validated = validateSql(proposal.sql);
        return response({ ...metadata, sql:proposal.sql, executableSql:validated.executionSql, rationale:proposal.rationale });
      } catch (error) {
        if (!(error instanceof SqlValidationError)) throw error;
        return response({ ...metadata, proposal, error:{code:'SQL_REJECTED',message:error.message} },422);
      }
    } catch (error) {
      if (error instanceof ApiError) return response({error:{code:error.code,message:error.message}},error.status);
      return response({error:{code:'INTERNAL_ERROR',message:'The request failed unexpectedly.'}},500);
    }
  },
};
