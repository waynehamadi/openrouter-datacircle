// Each tool's own call on the live API, as callModel's tool loop makes it: the model's input checked against the tool's
// inputSchema, then its execute with the loop's signal, what either throws given back as {"error": ...}; and the answers a
// model's mistakes get. npm test
import { z } from 'zod';
import { bestPlans, datacircleTools, listApis, providerRanks, searchPlans } from '@datacircle/openrouter';

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`);
  if (!ok) failed++;
};
// The tool's call as callModel makes it (executeRegularTool): its input parsed by its inputSchema, then its execute with
// the call's signal. What either throws, the model reads as {"error": message}; an answer, as its JSON.
const run = async (t, input, signal = new AbortController().signal) => {
  let result;
  try {
    result = await t.function.execute(z.parse(t.function.inputSchema, input), { signal, numberOfTurns: 1 });
  } catch (error) {
    if (signal.aborted) throw error;
    return { error: error.message };
  }
  return JSON.parse(JSON.stringify(result));
};

const NAMES = 'datacircle_list_apis,datacircle_best_plans,datacircle_search_plans,datacircle_provider';
const tools = datacircleTools();
const [listTool, bestTool, searchTool, providerTool] = tools;
check('names', tools.map((t) => t.function.name).join(',') === NAMES, tools.map((t) => t.function.name).join(','));
// What the model is sent: JSON Schema of an object, no other key, the needed keys required, as callModel converts it.
for (const t of tools) {
  const s = z.toJSONSchema(t.function.inputSchema, { target: 'draft-7' });
  check(`${t.function.name} definition`, t.type === 'function' && typeof t.function.execute === 'function' && t.function.description.includes('https://datacircle.dev')
    && s.type === 'object' && s.additionalProperties === false && (s.required ?? []).every((k) => k in s.properties)
    && Object.values(s.properties).every((p) => typeof p.description === 'string' && !('anyOf' in p) && p.maximum !== Number.MAX_SAFE_INTEGER),
  `required [${s.required ?? []}] of [${Object.keys(s.properties)}]`);
}

let r = await run(listTool, {});
check('list_apis', r.total > 100 && r.apis.length === 20 && r.apis[0].slug, `total ${r.total}, first ${r.apis[0]?.slug}`);
r = await run(listTool, { query: 'email', limit: '3' });
check('list_apis email, limit as a string', r.apis?.length === 3 && r.apis.every((a) => /email/i.test(a.api + a.slug)) && !r.note, r.apis?.map((a) => a.slug).join(', '));
r = await run(listTool, { query: 'Bright Data' });
check('list_apis provider name', typeof r.note === 'string' && r.note.includes('datacircle_search_plans'), r.note);
r = await run(listTool, { query: null, limit: null });
check('list_apis nulls', r.apis?.length === 20 && !r.note, `${r.apis?.length} APIs`);

r = await run(bestTool, { slug: 'email-finder', limit: 3 });
check('best_plans', r.plans.length === 3 && r.plans[0].rank === 1 && typeof r.plans[0].score === 'number' && r.plans[0].page && !('aggregators' in r.plans[0]),
  `${r.api}: ${r.plans.map((p) => `${p.rank}. ${p.provider} ${p.score}`).join(' / ')}`);
r = await run(bestTool, { slug: 'Email Finder', limit: 99 });
check('best_plans name, limit 99', r.plans?.length >= 10 && r.slug === 'email-finder', `${r.plans?.length} plans`);
r = await run(bestTool, { slug: 'bright-data' });
check('best_plans unknown slug', r.error?.startsWith('no API has the slug bright-data') && r.error.includes('datacircle_search_plans'), r.error);
r = await run(bestTool, { slug: '' });
check('best_plans empty slug', r.error?.startsWith("Give an API's slug"), r.error);
r = await run(bestTool, { limit: 2 });
check('best_plans no slug: the check refuses it', /"slug"/.test(r.error ?? ''), r.error?.replace(/\s+/g, ' '));
r = await run(bestTool, { slug: 'serp', limit: 'many' });
check('best_plans limit not a number: the check refuses it', /"limit"/.test(r.error ?? ''), r.error?.replace(/\s+/g, ' '));
r = await run(bestTool, { slug: 'serp', limit: 2, extra: true });
check('best_plans a key of its own: dropped', r.plans?.length === 2, `${r.plans?.length} plans`);
r = await run(bestTool, { slug: 'serp', limit: 2.9 });
check('best_plans a fraction: its whole part', r.plans?.length === 2, `${r.plans?.length} plans`);

r = await run(searchTool, { query: 'bright data', sort: 'price', limit: 5 });
check('search_plans', r.total > 0 && r.plans.length === 5 && r.plans.every((p) => /bright data/i.test(p.provider)), `total ${r.total}, cheapest ${r.plans[0]?.perThousand}`);
r = await run(searchTool, { api: 'email-finder', limit: 2, offset: 1 });
check('search_plans api offset', r.plans.length === 2 && r.plans[0].rank === 2, r.plans.map((p) => `${p.rank}. ${p.provider}`).join(' / '));
r = await run(searchTool, { api: 'Bright Data' });
check('search_plans provider as api', r.total > 0 && r.note?.startsWith('No API is named'), `total ${r.total}: ${r.note}`);
r = await run(searchTool, { query: 'bright-data' });
check('search_plans slug as query', r.total > 0 && r.note?.includes('"bright data"'), `total ${r.total}: ${r.note}`);
r = await run(searchTool, { offset: -3, limit: 0 });
check('search_plans out of range: the defaults', r.plans?.length === 10 && r.offset === 0, `${r.plans?.length} plans from ${r.offset}`);
r = await run(searchTool, { api: null, query: 'emelia', sort: null, limit: null, offset: null });
check('search_plans nulls', r.total > 0 && r.plans.every((p) => /emelia/i.test(p.provider + p.plan)), `total ${r.total}`);
r = await run(searchTool, { sort: 'cheapest' });
check('search_plans bad sort: the check refuses it', /"sort"/.test(r.error ?? ''), r.error?.replace(/\s+/g, ' '));

r = await run(providerTool, { slug: 'Bright Data' });
check('provider', r.slug === 'bright-data' && r.total > 10 && r.ranked > 0 && r.apis[0].rank <= r.apis[1].rank && r.apis[0].best?.plan,
  `${r.provider}: ${r.total} APIs, ranked on ${r.ranked}, best ${r.apis[0].api} #${r.apis[0].rank}`);
r = await run(providerTool, { slug: 'nobody-x' });
check('provider unknown', r.error?.startsWith('no provider has the slug nobody-x'), r.error);
r = await run(providerTool, { slug: 'email-finder' });
check("provider: an API's slug", r.error?.startsWith('no provider has the slug email-finder') && r.error.includes('datacircle_best_plans'), r.error);

// The same calls without a model.
for (const [name, call] of [['listApis', () => listApis({ limit: 1 })], ['bestPlans', () => bestPlans({ slug: 'serp', limit: 1 })],
  ['searchPlans', () => searchPlans({ limit: 1 })], ['providerRanks', () => providerRanks({ slug: 'bright-data' })]]) {
  r = await call();
  check(name, !r.error && (r.apis ?? r.plans)?.length > 0, Object.keys(r).join(','));
}
r = await bestPlans({ slug: 'nope-api' });
check('bestPlans unknown: {error}', r.error?.startsWith('no API has the slug nope-api'), r.error);

// Each call's User-Agent, through a fetch of the app's own.
const seen = [];
const [, traced] = datacircleTools({ fetch: (url, init) => (seen.push([String(url), init.headers['User-Agent']]), fetch(url, init)) });
await run(traced, { slug: 'serp', limit: 1 });
check('fetch option', seen.length === 1 && seen[0][0] === 'https://api.datacircle.dev/v1/apis/serp/best?limit=1' && seen[0][1] === 'datacircle-openrouter/0.1.0', seen.flat().join(' '));

// The loop's abort signal stops the call.
const controller = new AbortController();
controller.abort(new Error('stopped'));
r = await run(bestTool, { slug: 'serp' }, controller.signal).then((answer) => answer, (error) => error);
check('abort signal', r instanceof Error && /stopped|abort/i.test(r.message), String(r?.message ?? JSON.stringify(r)));

// A network that fails is the model's to read as {"error"}, and the run goes on.
const [, down] = datacircleTools({ baseURL: 'http://127.0.0.1:9' });
r = await run(down, { slug: 'serp' });
check('network down', r.error?.startsWith('datacircle:'), r.error);

console.log(failed === 0 ? 'ALL OK' : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
