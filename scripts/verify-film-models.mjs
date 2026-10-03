// Read-only fal discovery: no API key, inference request or paid generation.
// Optional --snapshot refreshes generated test fixtures from public OpenAPI schemas.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
const source = await readFile("src/lib/films/models.ts", "utf8");
const endpoints = [...source.matchAll(/model\("[^"]+", "([^"]+)"/g)].map(m=>m[1]);
const contracts = {};
for (const endpoint of endpoints) {
  const response = await fetch(`https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=${encodeURIComponent(endpoint)}`, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Schema unavailable: ${endpoint} (${response.status})`);
  const schema = await response.json();
  const request = schema?.paths?.[`/${endpoint}`]?.post?.requestBody?.content?.["application/json"]?.schema;
  const input = request?.$ref ? schema.components.schemas[request.$ref.split("/").at(-1)] : request;
  if (!input?.properties) throw new Error(`Input schema missing: ${endpoint}`);
  const outputRef = schema.paths[`/${endpoint}/requests/{request_id}`]?.get?.responses?.["200"]?.content?.["application/json"]?.schema;
  const output = outputRef?.$ref ? schema.components.schemas[outputRef.$ref.split("/").at(-1)] : outputRef;
  if (!output?.properties?.video) throw new Error(`Expected video output missing: ${endpoint}`);
  contracts[endpoint] = { input, output, schemas: schema.components.schemas };
  console.log(`Verified schema + video output: ${endpoint}`);
}
if (process.argv.includes("--snapshot")) {
  const target = path.resolve("tests/fixtures/film-fal-schemas.json");
  await mkdir(path.dirname(target),{recursive:true});
  await writeFile(target, JSON.stringify({checkedAt:new Date().toISOString(),contracts},null,2)+"\n");
}
console.log(`${endpoints.length} public schemas verified. No paid requests submitted.`);
