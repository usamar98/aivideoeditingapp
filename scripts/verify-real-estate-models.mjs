// Public metadata only. Never submits inference or reads credentials.
import { readFile, writeFile } from "node:fs/promises";
const catalog = await readFile("src/lib/films/models.ts", "utf8");
const selected = await readFile("src/lib/real-estate/schema.ts", "utf8");
const ids = selected.match(/estateModelIds = \[([^\]]+)\]/)[1];
const endpoints = [...catalog.matchAll(/"([^"]+)": model\("[^"]+", "([^"]+)"/g)].filter(m => ids.includes(`"${m[1]}"`)).map(m => m[2]);
endpoints.push("fal-ai/elevenlabs/tts/eleven-v3");
const contracts = {};
await Promise.all(endpoints.map(async endpoint => {
  const response = await fetch(`https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=${encodeURIComponent(endpoint)}`, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Schema unavailable: ${endpoint} (${response.status})`);
  const schema = await response.json();
  const request = schema.paths?.[`/${endpoint}`]?.post?.requestBody?.content?.["application/json"]?.schema;
  const input = request?.$ref ? schema.components.schemas[request.$ref.split("/").at(-1)] : request;
  if (!input?.properties) throw new Error(`Input schema missing: ${endpoint}`);
  contracts[endpoint] = { input, schemas: schema.components.schemas };
  console.log(`Verified public input contract: ${endpoint}`);
}));
if (process.argv.includes("--snapshot")) await writeFile("tests/fixtures/real-estate-fal-schemas.json", JSON.stringify({ checkedAt: new Date().toISOString(), contracts }, null, 2) + "\n");
console.log(`${endpoints.length} schemas verified. No paid requests submitted.`);
