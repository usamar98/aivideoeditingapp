import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

let db: PGlite;
const user = randomUUID(), other = randomUUID();
beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); grant usage on schema public to anon,authenticated,service_role;");
  await db.exec(readFileSync("supabase/migrations/20260927110254_facebook_publishing.sql", "utf8"));
  await db.query("insert into auth.users values($1),($2)", [user, other]);
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("reset role; truncate public.facebook_connections,public.facebook_posts,public.facebook_oauth_states,public.facebook_deletions; set role service_role;"); });
async function start(owner = user) {
  await db.query("select public.begin_facebook_oauth($1,$2)", [owner, owner]);
  await db.query("update public.facebook_oauth_states set consumed=true where user_id=$1", [owner]);
}
async function grant(owner = user, remote = "111") {
  await db.query("select public.prepare_facebook_grant($1,$2,$3,$4,'encrypted-grant')", [owner, owner, remote, `hash:${remote}`]);
}
async function connect(owner = user, page = "222", remote = "111") {
  await start(owner); await grant(owner, remote);
  await db.query("select public.complete_facebook_oauth($1,$2,$3,$4,'Page','encrypted-user','encrypted-page')", [owner, owner, remote, page]);
}
async function enqueue(patch: Record<string, unknown> = {}) {
  const payload = { requestId: randomUUID(), source: { kind: "shorts", projectId: randomUUID(), outputKey: "clip-1" }, sourcePath: randomUUID(), title: "A Reel", description: "Caption", syntheticMedia: true, rightsConfirmed: true, scheduledAt: null, ...patch };
  return (await db.query<{ id: string }>("select public.enqueue_facebook_post($1,$2::jsonb) as id", [user, JSON.stringify(payload)])).rows[0].id;
}
async function claim(id: string, worker = randomUUID()) { return (await db.query<{ ok: boolean }>("select public.claim_facebook_post($1,$2) as ok", [id, worker])).rows[0].ok; }
async function finish(id: string, worker: string) { return (await db.query<{ ok: boolean }>("select public.begin_facebook_finish($1,$2) as ok", [id, worker])).rows[0].ok; }
describe("Facebook migration permissions and transactions", () => {
  it("denies browser roles credentials, records, and every service-only function", async () => {
    const functions = await db.query<{ oid: string }>("select oid::regprocedure::text as oid from pg_proc where pronamespace='public'::regnamespace and proname like '%facebook%'");
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`reset role; set role ${role}`);
      for (const table of ["facebook_connections", "facebook_posts", "facebook_oauth_states", "facebook_deletions"]) {
        await expect(db.query(`select * from public.${table}`)).rejects.toThrow(/permission denied/);
        await expect(db.query(`delete from public.${table}`)).rejects.toThrow(/permission denied/);
      }
      for (const fn of functions.rows) expect((await db.query<{ ok: boolean }>("select has_function_privilege(current_user,$1,'EXECUTE') as ok", [fn.oid])).rows[0].ok).toBe(false);
    }
    await db.exec("reset role");
    const rows = await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where relname in ('facebook_connections','facebook_posts','facebook_oauth_states','facebook_deletions')");
    expect(rows.rows).toHaveLength(4); expect(rows.rows.every((r) => r.relrowsecurity)).toBe(true);
  });
  it("requires a consumed, owner-bound, unexpired grant and consumes it once", async () => {
    await start(); await grant();
    const complete = (owner: string) => db.query("select public.complete_facebook_oauth($1,$2,'111','222','Page','u','p')", [owner, user]);
    await expect(complete(other)).rejects.toThrow(/expired/);
    await complete(user); await expect(complete(user)).rejects.toThrow(/expired/);
    await start(); await grant();
    await expect(db.query("select public.complete_facebook_oauth($1,$2,'111','333','Page','u','p')", [user, user])).rejects.toThrow(/changing Page/);
    await db.query("update public.facebook_oauth_states set expires_at=now()-interval '1 minute'");
    await expect(complete(user)).rejects.toThrow(/expired/);
  });
  it("prevents deletion racing OAuth from restoring removed access", async () => {
    await start();
    await db.query("select public.delete_facebook_data('111','hash:111')");
    await expect(grant()).rejects.toThrow(/removed/);
    await start(); await grant();
    await db.query("select public.delete_facebook_data('111','hash:111')");
    await expect(db.query("select public.complete_facebook_oauth($1,$2,'111','222','Page','u','p')", [user, user])).rejects.toThrow(/removed/);
  });
  it("deduplicates request IDs/exports, enforces consent, schedules and a ten-post cap", async () => {
    await connect(); const requestId = randomUUID(), sourcePath = "owned/output.mp4";
    const id = await enqueue({ requestId, sourcePath }); expect(await enqueue({ requestId, sourcePath })).toBe(id);
    await expect(enqueue({ sourcePath })).rejects.toThrow(/duplicate/);
    await expect(enqueue({ rightsConfirmed: false })).rejects.toThrow(/Consent/);
    await expect(enqueue({ scheduledAt: new Date(Date.now() - 1000).toISOString() })).rejects.toThrow(/schedule/);
    for (let i = 0; i < 9; i++) await enqueue();
    await expect(enqueue()).rejects.toThrow(/Ten pending/);
    await db.query("select public.cancel_facebook_post($1,$2)", [user, id]);
    await expect(enqueue({ sourcePath })).resolves.toBeTypeOf("string");
  });
  it("fences workers and never allows finish after cancellation or vice versa", async () => {
    await connect(); const id = await enqueue(), worker = randomUUID();
    expect(await claim(id, worker)).toBe(true); expect(await claim(id)).toBe(false);
    await expect(db.query("select public.cancel_facebook_post($1,$2)", [other, id])).rejects.toThrow(/not found/);
    await db.query("update public.facebook_posts set video_id='444',upload_started_at=now() where id=$1", [id]);
    expect(await finish(id, randomUUID())).toBe(false);
    expect(await finish(id, worker)).toBe(true); expect(await finish(id, worker)).toBe(false);
    await expect(db.query("select public.cancel_facebook_post($1,$2)", [user, id])).rejects.toThrow(/Publication has started/);
    const cancelId = await enqueue(), otherWorker = randomUUID(); await claim(cancelId, otherWorker);
    await db.query("update public.facebook_posts set video_id='555',upload_started_at=now() where id=$1", [cancelId]);
    await db.query("select public.cancel_facebook_post($1,$2)", [user, cancelId]);
    expect(await finish(cancelId, otherWorker)).toBe(false); expect(await claim(cancelId)).toBe(false);
  });
  it("blocks early scheduled publication, expired leases and connection switching during work", async () => {
    await connect(); const id = await enqueue({ scheduledAt: new Date(Date.now() + 3600_000).toISOString() }), worker = randomUUID();
    await claim(id, worker); await db.query("update public.facebook_posts set video_id='444',upload_started_at=now() where id=$1", [id]);
    expect(await finish(id, worker)).toBe(false);
    await expect(db.query("select public.begin_facebook_disconnect($1)", [user])).rejects.toThrow(/active worker/);
    await db.query("update public.facebook_posts set scheduled_at=null,lease_until=now()-interval '1 minute' where id=$1", [id]);
    expect(await finish(id, worker)).toBe(false);
    await db.query("select public.begin_facebook_disconnect($1)", [user]); expect(await claim(id)).toBe(false);
    await expect(enqueue()).rejects.toThrow(/Connect a Facebook/);
  });
  it("enforces ownership and cascades signed deletion without removing other accounts", async () => {
    await connect(); await connect(other, "333", "999"); const id = await enqueue();
    const foreign = (await db.query<{ id: string }>("select id from public.facebook_connections where user_id=$1", [other])).rows[0].id;
    await expect(db.query("update public.facebook_posts set connection_id=$1 where id=$2", [foreign, id])).rejects.toThrow(/foreign key/);
    const remove = async () => (await db.query<{ receipt: string }>("select public.delete_facebook_data('111','hash:111') as receipt")).rows[0].receipt;
    expect(await remove()).toBe(await remove());
    expect((await db.query("select * from public.facebook_posts")).rows).toHaveLength(0);
    expect((await db.query("select * from public.facebook_connections where user_id=$1", [other])).rows).toHaveLength(1);
    await db.exec("reset role"); expect((await db.query("select * from auth.users")).rows).toHaveLength(2);
  });
});
