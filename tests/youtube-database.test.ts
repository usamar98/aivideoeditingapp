import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

let db: PGlite;
const user = randomUUID(), other = randomUUID();
beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); grant usage on schema public to anon,authenticated,service_role;");
  await db.exec(readFileSync("supabase/migrations/20260926191045_youtube_publishing.sql", "utf8"));
  await db.query("insert into auth.users values($1),($2)", [user, other]);
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("reset role; truncate public.social_connections,public.social_oauth_states,public.social_posts; set role service_role;"); });
async function start(owner = user, state = "state") {
  await db.query("select public.begin_social_oauth($1,$2,'encrypted-verifier')", [owner, state]);
  await db.query("update public.social_oauth_states set consumed=true where user_id=$1", [owner]);
}
async function connect(owner = user, channel = "UCtest") {
  await start(owner);
  await db.query("select public.complete_social_oauth($1,'state',$2,'Channel','encrypted-token')", [owner, channel]);
}
async function enqueue(requestId: string = randomUUID(), sourcePath: string = randomUUID()) {
  const payload = { requestId, source: { kind: "shorts", projectId: randomUUID(), outputKey: "clip-1" }, sourcePath, title: "Test upload", description: "", visibility: "private", scheduledAt: null, madeForKids: false, syntheticMedia: true };
  return (await db.query<{ id: string }>("select public.enqueue_social_post($1,$2::jsonb) as id", [user, JSON.stringify(payload)])).rows[0].id;
}
describe("YouTube migration permissions and atomic transitions", () => {
  it("denies browser roles all credentials, posting tables and trusted RPCs", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`reset role; set role ${role}`);
      for (const table of ["social_connections", "social_posts", "social_oauth_states"]) {
        await expect(db.query(`select * from public.${table}`)).rejects.toThrow(/permission denied/);
        await expect(db.query(`delete from public.${table}`)).rejects.toThrow(/permission denied/);
      }
      for (const sql of ["begin_social_oauth($1,'x','y')", "complete_social_oauth($1,'x','c','t','k')", "enqueue_social_post($1,'{}'::jsonb)", "begin_social_disconnect($1)", "claim_social_post($1,gen_random_uuid())"]) await expect(db.query(`select public.${sql}`, [user])).rejects.toThrow(/permission denied/);
    }
    await db.exec("reset role");
    const rows = await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where relname in ('social_connections','social_posts','social_oauth_states')");
    expect(rows.rows.every((r) => r.relrowsecurity)).toBe(true);
  });
  it("consumes OAuth once and binds it to the initiating user", async () => {
    await start();
    await expect(db.query("select public.complete_social_oauth($1,'state','UCtest','Title','token')", [other])).rejects.toThrow(/expired/);
    await db.query("select public.complete_social_oauth($1,'state','UCtest','Title','token')", [user]);
    await expect(db.query("select public.complete_social_oauth($1,'state','UCtest','Title','token')", [user])).rejects.toThrow(/expired/);
    await start();
    await expect(db.query("select public.complete_social_oauth($1,'state','UCanother','Title','token')", [user])).rejects.toThrow(/changing channel/);
  });
  it("invalidates in-flight authorization on disconnect and rejects expired/unclaimed state", async () => {
    await connect(); await start();
    await db.query("select public.begin_social_disconnect($1)", [user]);
    await db.query("delete from public.social_connections where user_id=$1", [user]);
    await expect(db.query("select public.complete_social_oauth($1,'state','UCtest','Title','token')", [user])).rejects.toThrow(/expired/);
    await db.query("select public.begin_social_oauth($1,'new','verifier')", [user]);
    await expect(db.query("select public.complete_social_oauth($1,'new','UCtest','Title','token')", [user])).rejects.toThrow(/expired/);
    await db.query("update public.social_oauth_states set consumed=true,expires_at=now()-interval '1 minute'");
    await expect(db.query("select public.complete_social_oauth($1,'new','UCtest','Title','token')", [user])).rejects.toThrow(/expired/);
  });
  it("deduplicates requests and source exports and limits pending uploads", async () => {
    await connect(); const request = randomUUID(), path = "owned/video.mp4", id = await enqueue(request, path);
    expect(await enqueue(request, path)).toBe(id);
    await expect(enqueue(randomUUID(), path)).rejects.toThrow(/duplicate/);
    for (let i = 0; i < 9; i++) await enqueue();
    await expect(enqueue()).rejects.toThrow(/ten pending/);
    await db.query("update public.social_posts set status='cancelled' where id=$1", [id]);
    await expect(enqueue(randomUUID(), path)).resolves.toBeTypeOf("string");
  });
  it("fences duplicate workers and blocks disconnect only while a lease is active", async () => {
    await connect(); const id = await enqueue(), worker = randomUUID();
    const claim = async () => (await db.query<{ ok: boolean }>("select public.claim_social_post($1,$2) as ok", [id, worker])).rows[0].ok;
    expect(await claim()).toBe(true); expect(await claim()).toBe(false);
    await expect(db.query("select public.begin_social_disconnect($1)", [user])).rejects.toThrow(/active/);
    await db.query("update public.social_posts set lease_until=now()-interval '1 minute' where id=$1", [id]);
    expect(await claim()).toBe(true);
    await db.query("update public.social_posts set lease_until=null,lease_token=null where id=$1", [id]);
    await db.query("select public.begin_social_disconnect($1)", [user]);
    expect(await claim()).toBe(false);
    await expect(enqueue()).rejects.toThrow(/Connect YouTube/);
    await db.query("delete from public.social_connections where user_id=$1", [user]);
    expect((await db.query("select * from public.social_posts")).rows).toHaveLength(0);
  });
  it("does not allow a post to use another account's connection", async () => {
    await connect(); await connect(other, "UCother"); const id = await enqueue();
    const foreign = (await db.query<{ id: string }>("select id from public.social_connections where user_id=$1", [other])).rows[0].id;
    await expect(db.query("update public.social_posts set connection_id=$1 where id=$2", [foreign, id])).rejects.toThrow(/foreign key/);
  });
});
