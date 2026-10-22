import assert from "node:assert/strict";

// Read-only production preflight. Do not use browser HTTPS upgrades as HTTP proof.
const origins = ["http://createaivideos.app", "http://www.createaivideos.app", "https://www.createaivideos.app", "http://editingapp.live", "https://editingapp.live", "http://www.editingapp.live", "https://www.editingapp.live"];
const checks = [];
for (const origin of origins) {
  for (const path of ["/", "/guides/how-to-make-ai-videos?migration_check=1"]) {
    const expected = `https://createaivideos.app${path}`;
    let current = `${origin}${path}`;
    const hops = [], visited = new Set();
    while (current !== expected) {
      assert.ok(!visited.has(current) && hops.length < 4, `${origin}: redirect loop or excessive chain`);
      visited.add(current);
      const response = await fetch(current, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(20000) });
      assert.ok([301, 308].includes(response.status), `${current}: expected permanent redirect, received ${response.status}`);
      const location = response.headers.get("location");
      assert.ok(location, `${current}: missing Location`);
      const next = new URL(location, current);
      assert.equal(next.pathname + next.search, new URL(current).pathname + new URL(current).search, `${current}: preserve path and query`);
      assert.equal(next.protocol, "https:", `${current}: redirect to HTTPS`);
      assert.ok(["createaivideos.app", "www.createaivideos.app", "editingapp.live", "www.editingapp.live"].includes(next.hostname), "Unexpected redirect host");
      hops.push({ from: current, status: response.status, to: next.href });
      current = next.href;
    }
    const final = await fetch(current, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(20000) });
    assert.equal(final.status, 200, `${current}: final page must serve directly`);
    checks.push({ origin, path, hops, finalStatus: final.status });
  }
}
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), checks }, null, 2));
