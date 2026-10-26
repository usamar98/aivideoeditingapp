import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

let db: PGlite;
const user = randomUUID(), other = randomUUID(), digest = "a".repeat(43);
beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); grant usage on schema public to anon,authenticated,service_role;");
  await db.exec(readFileSync("supabase/migrations/20261026210910_tiktok_publishing.sql", "utf8"));
  await db.query("insert into auth.users values($1),($2)", [user, other]);
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("reset role; truncate public.tiktok_connections,public.tiktok_posts,public.tiktok_oauth_states; set role service_role;"); });
async function start(owner = user, state = digest) { await db.query("select public.begin_tiktok_oauth($1,$2)", [owner, state]); }
async function complete(owner = user, remote = "open-id") { return db.query("select public.complete_tiktok_oauth($1,$2,$3,'Name','username','encrypted')", [owner, digest, remote]); }
async function connect() { await start(); await db.query("update public.tiktok_oauth_states set consumed=true"); await complete(); }
async function enqueue(patch: Record<string, unknown> = {}) {
  const payload = { requestId: randomUUID(), source: { kind: "shorts", projectId: randomUUID(), outputKey: "clip-1" }, sourcePath: randomUUID(), caption: "Caption", privacy: "SELF_ONLY", allowComments: false, allowDuet: false, allowStitch: false, commercialContent: false, brandOrganic: false, brandedContent: false, syntheticMedia: true, rightsConfirmed: true, musicConfirmed: true, brandedPolicyConfirmed: false, scheduledAt: null, ...patch };
  return (await db.query<{ id: string }>("select public.enqueue_tiktok_post($1,$2::jsonb) as id", [user, JSON.stringify(payload)])).rows[0].id;
}
async function claim(id: string, worker = randomUUID()) { return (await db.query<{ ok: boolean }>("select public.claim_tiktok_post($1,$2) as ok", [id, worker])).rows[0].ok; }
async function begin(id: string, worker: string) { return (await db.query<{ ok: boolean }>("select public.begin_tiktok_publish($1,$2,$3,now()+interval '2 hours') as ok", [id, worker, digest])).rows[0].ok; }

describe("TikTok database security and atomic publishing boundaries", () => {
  it("enables RLS and denies browser roles tables/functions; uses only invoker routines", async () => {
    const functions = await db.query<{ oid: string; prosecdef: boolean }>("select oid::regprocedure::text as oid,prosecdef from pg_proc where pronamespace='public'::regnamespace and proname like '%tiktok%'");
    expect(functions.rows).toHaveLength(8); expect(functions.rows.every((fn) => !fn.prosecdef)).toBe(true);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`reset role; set role ${role}`);
      for (const table of ["tiktok_connections", "tiktok_posts", "tiktok_oauth_states"]) await expect(db.query(`select * from public.${table}`)).rejects.toThrow(/permission denied/);
      for (const fn of functions.rows) expect((await db.query<{ ok: boolean }>("select has_function_privilege(current_user,$1,'EXECUTE') as ok", [fn.oid])).rows[0].ok).toBe(false);
    }
    await db.exec("reset role");
    expect((await db.query<{ rls: boolean }>("select relrowsecurity as rls from pg_class where relname in ('tiktok_connections','tiktok_posts','tiktok_oauth_states')")).rows.every((row) => row.rls)).toBe(true);
  });
  it("requires consumed, owner-bound, unexpired state, and consumes it exactly once", async () => {
    await start(); await expect(complete()).rejects.toThrow(/expired/);
    await db.query("update public.tiktok_oauth_states set consumed=true"); await expect(complete(other)).rejects.toThrow(/expired/); await complete(); await expect(complete()).rejects.toThrow(/expired/);
    await start(); await db.query("update public.tiktok_oauth_states set consumed=true,expires_at=now()-interval '1 minute'"); await expect(complete()).rejects.toThrow(/expired/);
  });
  it("blocks switching account, token races and reconnect while a worker is active", async () => {
    await connect(); await start(); await db.query("update public.tiktok_oauth_states set consumed=true"); await expect(complete(user, "other-id")).rejects.toThrow(/same account/);
    const lease = randomUUID(); expect((await db.query<{ ok: boolean }>("select public.claim_tiktok_token($1,$2) as ok", [user, lease])).rows[0].ok).toBe(true);
    expect((await db.query<{ ok: boolean }>("select public.claim_tiktok_token($1,$2) as ok", [user, randomUUID()])).rows[0].ok).toBe(false);
    await expect(complete()).rejects.toThrow(/same account/); await expect(db.query("select public.begin_tiktok_disconnect($1)", [user])).rejects.toThrow(/active/);
    await db.query("update public.tiktok_connections set token_lease=null,token_lease_until=null"); const id = await enqueue(); await claim(id); await expect(complete()).rejects.toThrow(/active/);
  });
  it("enforces consent/commercial privacy, schedule bounds, cap and request/export deduplication", async () => {
    await connect(); const requestId = randomUUID(), sourcePath = "owned/export.mp4", id = await enqueue({ requestId, sourcePath });
    expect(await enqueue({ requestId, sourcePath })).toBe(id); await expect(enqueue({ sourcePath })).rejects.toThrow(/duplicate/);
    for (const patch of [{ rightsConfirmed: false }, { musicConfirmed: false }, { musicConfirmed: null }]) await expect(enqueue(patch)).rejects.toThrow(/Consent/);
    await expect(enqueue({ commercialContent: true })).rejects.toThrow(/check constraint/);
    await expect(enqueue({ commercialContent: true, brandedContent: true, brandedPolicyConfirmed: true })).rejects.toThrow(/check constraint/);
    await expect(enqueue({ privacy: "" })).rejects.toThrow(/check constraint/);
    for (const scheduledAt of [new Date().toISOString(), new Date(Date.now() + 100 * 86400_000).toISOString()]) await expect(enqueue({ scheduledAt })).rejects.toThrow(/schedule/);
    for (let i = 0; i < 9; i++) await enqueue(); await expect(enqueue()).rejects.toThrow(/Ten pending/);
    await db.query("select public.cancel_tiktok_post($1,$2)", [user, id]); await expect(enqueue({ sourcePath })).resolves.toBeTypeOf("string");
  });
  it("serializes cancellation against init intent and fences replay, stale workers and future schedules", async () => {
    await connect(); const id = await enqueue(), worker = randomUUID(); expect(await claim(id, worker)).toBe(true); expect(await claim(id)).toBe(false);
    expect(await begin(id, randomUUID())).toBe(false); expect(await begin(id, worker)).toBe(true); expect(await begin(id, worker)).toBe(false);
    await expect(db.query("select public.cancel_tiktok_post($1,$2)", [user, id])).rejects.toThrow(/Posting started/);
    await expect(db.query("select public.cancel_tiktok_post($1,$2)", [other, id])).rejects.toThrow(/not found/);
    const next = await enqueue(); await claim(next, worker); await db.query("select public.cancel_tiktok_post($1,$2)", [user, next]); expect(await begin(next, worker)).toBe(false);
    const future = await enqueue({ scheduledAt: new Date(Date.now() + 3600_000).toISOString() }); await claim(future, worker); expect(await begin(future, worker)).toBe(false);
    await db.query("update public.tiktok_posts set lease_until=now()-interval '1 second' where id=$1", [future]); expect(await begin(future, worker)).toBe(false);
  });
  it("disconnect invalidates OAuth, prevents claims and cascades only owned TikTok rows", async () => {
    await connect(); const id = await enqueue(); await start(); await db.query("select public.begin_tiktok_disconnect($1)", [user]);
    expect(await claim(id)).toBe(false); await expect(complete()).rejects.toThrow();
    expect((await db.query("select * from public.tiktok_oauth_states")).rows).toHaveLength(0);
    await db.query("delete from public.tiktok_connections where user_id=$1", [user]); expect((await db.query("select * from public.tiktok_posts")).rows).toHaveLength(0);
  });
  it("rejects cross-account queue connection references even for a backend mistake", async () => {
    await connect(); const id = await enqueue(); await expect(db.query("update public.tiktok_posts set user_id=$1 where id=$2", [other, id])).rejects.toThrow(/foreign key/);
  });
});
