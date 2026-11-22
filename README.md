# Datacircle tools for OpenRouter Agent

Find the best GTM APIs. We benchmark all the GTM APIs and we put the results on our website.

Our website: https://datacircle.dev

This package gives [OpenRouter Agent](https://github.com/OpenRouterTeam/typescript-agent) (`@openrouter/agent`) four tools that call Datacircle's open API, https://api.datacircle.dev/v1. They are made with the package's `tool()` and run in `callModel`'s tool loop. You need no key and no account for Datacircle.

| Tool | What the tool gives | Call |
| --- | --- | --- |
| `datacircle_list_apis` | Every GTM API on Datacircle, with the API's slug, number of plans, number of providers and best plan | `GET /apis` |
| `datacircle_best_plans` | One API's plans, sorted by score out of 100, best first. Each plan comes with a rank and a price per 1,000 calls | `GET /apis/{slug}/best` |
| `datacircle_search_plans` | Plans that match a provider or plan name, on all APIs or on one API. You can sort them by score, provider or price | `GET /plans` |
| `datacircle_provider` | The APIs a provider sells, and the provider's rank on each API | `GET /providers/{slug}` |

## Install

```bash
npm install @datacircle/openrouter @openrouter/agent @openrouter/sdk
```

The tools work with `@openrouter/agent` 0.7.0 and later. Like `@openrouter/agent`, the package is ESM-only. From CommonJS, use `await import('@datacircle/openrouter')`.

## Use the tools

Give the tools to `callModel`:

```ts
import { OpenRouter } from '@openrouter/sdk';
import { callModel } from '@openrouter/agent';
import { datacircleTools } from '@datacircle/openrouter';

const client = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

const result = callModel(client, {
  model: 'openai/gpt-5.2',
  input: 'Who are the 3 best providers for the email-finder API?',
  tools: datacircleTools(),
});

console.log(await result.getText());
```

The tools run on their own in the loop. Every way to read a result works: `getTextStream()`, `getToolCallsStream()`, `getFullResponsesStream()` and the rest. `client.callModel()` on `@openrouter/agent`'s own `OpenRouter` client works the same way.

The tools can sit beside your own tools in the same list: `tools: [...datacircleTools(), myTool]`. A subagent made with `tool.agent()` can take them in its `tools` too. To give the model only some of the tools, filter them by name: `datacircleTools().filter((t) => t.function.name !== 'datacircle_provider')`.

## Make each call yourself

You can also make each call without a model. You get the answer the model would read, as an object:

```ts
import { bestPlans } from '@datacircle/openrouter';

const answer = await bestPlans({ slug: 'email-finder', limit: 3 });
console.log(answer.plans);
```

The other calls are `listApis()`, `searchPlans()` and `providerRanks()`.

## What the model reads

Each tool gives the model a JSON object. Each plan comes with a rank, provider, plan, score, price per 1,000 (`perThousand`, in dollars) and a page on datacircle.dev. That page lists every field.

When the API gives no data, for example for an unknown slug, the model reads `{"error": ...}` with the API's message. When the input does not fit the schema, the error names each wrong argument. If the network fails, the model gets the error's message the same way. The model can then call again, and the run goes on. When the run stops, or a tool's `timeoutMs` or the run's `toolTimeoutMs` runs out, the call stops too.

`datacircleTools({ fetch })` sets the `fetch` the tools use, for example to add a proxy. Each call without a model takes the same options as its second argument.

## Network

Each tool call makes one HTTPS GET request to https://api.datacircle.dev/v1 and nothing else. The request holds only the tool's own arguments: no key and nothing from your chats. The API takes up to 60 calls a minute from one IP address. The tool waits once, for a minute at most, when the API asks the tool to wait. The package depends only on zod, and stores nothing.

## Links

- Datacircle: https://datacircle.dev
- The API: https://datacircle.dev/api
- The API's spec: https://api.datacircle.dev/v1/openapi.json
- What each key means: https://datacircle.dev/fields

MIT license.
