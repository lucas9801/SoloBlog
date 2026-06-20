import assert from "node:assert/strict";
import { onRequestGet, onRequestPost } from "../functions/api/views.js";
import { rankingItems } from "../src/views.js";

class MockDatabase {
  constructor() {
    this.rows = new Map();
    this.events = new Set();
    this.clock = 0;
    this.statements = [];
  }

  prepare(sql) {
    this.statements.push(sql);
    return new MockStatement(this, sql);
  }
}

class MockStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.args = [];
  }

  bind(...args) {
    this.args = args;
    return this;
  }

  async run() {
    if (this.sql.includes("DELETE FROM post_view_events")) {
      const [cutoff] = this.args;
      let changes = 0;
      for (const key of [...this.db.events]) {
        const viewedOn = key.split(":").at(-1);
        if (viewedOn < cutoff) {
          this.db.events.delete(key);
          changes += 1;
        }
      }
      return { success: true, meta: { changes } };
    }

    if (this.sql.includes("INSERT OR IGNORE INTO post_view_events")) {
      const [slug, viewerKey, viewedOn] = this.args;
      const key = `${slug}:${viewerKey}:${viewedOn}`;
      if (this.db.events.has(key)) return { success: true, meta: { changes: 0 } };
      this.db.events.add(key);
      return { success: true, meta: { changes: 1 } };
    }

    if (!this.sql.includes("INSERT INTO post_views")) return { success: true };

    const slug = this.args[0];
    const row = this.db.rows.get(slug) || { slug, views: 0, updatedAt: 0 };
    row.views += 1;
    row.updatedAt = ++this.db.clock;
    this.db.rows.set(slug, row);
    return { success: true };
  }

  async all() {
    if (this.sql.includes("ORDER BY views DESC")) {
      const limit = Number.parseInt(this.args[0], 10) || 0;
      return {
        results: [...this.db.rows.values()]
          .filter(({ slug }) => !this.sql.includes("slug GLOB") || isCanonicalSlug(slug))
          .sort((a, b) => b.views - a.views || b.updatedAt - a.updatedAt)
          .slice(0, limit)
          .map(({ slug, views }) => ({ slug, views }))
      };
    }

    if (this.sql.includes("WHERE slug IN")) {
      return {
        results: this.args
          .map((slug) => this.db.rows.get(slug))
          .filter(Boolean)
          .map(({ slug, views }) => ({ slug, views }))
      };
    }

    return { results: [] };
  }

  async first() {
    const slug = this.args[0];
    const row = this.db.rows.get(slug);
    return row ? { views: row.views } : null;
  }
}

class BrokenDatabase {
  prepare() {
    throw new Error("D1 unavailable");
  }
}

function isCanonicalSlug(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value || ""));
}

function context(db, request) {
  return {
    request,
    env: db ? { BLOG_DB: db } : {}
  };
}

function jsonRequest(method, url, body, headers = {}) {
  return new Request(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

function viewRequest(slug, ip) {
  return jsonRequest("POST", "https://blog.solus.games/api/views", { slug }, {
    "CF-Connecting-IP": ip,
    "User-Agent": `test-reader-${ip}`
  });
}

async function readJson(response) {
  return {
    status: response.status,
    body: await response.json()
  };
}

const rankingPosts = [
  { slug: "start-here", title: "Start", url: "/posts/start-here/", date: "2026-06-04", category: "随笔" },
  { slug: "render-optimization-checklist", title: "Render", url: "/posts/render/", date: "2026-06-03", category: "图形渲染" },
  { slug: "game-team-toolchain", title: "Tools", url: "/posts/tools/", date: "2026-06-02", category: "工具链" },
  { slug: "unity-performance-start", title: "Unity", url: "/posts/unity/", date: "2026-06-01", category: "Unity" },
  { slug: "unsafe-post", title: "Unsafe", url: "javascript:alert(1)", date: "2026-05-31", category: "测试" },
  { slug: "external-post", title: "External", url: "https://example.com/posts/external/", date: "2026-05-30", category: "测试" }
];
const sparseRanking = rankingItems(
  [
    { slug: "render-optimization-checklist", views: "7" },
    { slug: "unknown-post", views: 99 },
    { slug: "render-optimization-checklist", views: 9 },
    { slug: "unsafe-post", views: 8 },
    { slug: "external-post", views: 6 }
  ],
  rankingPosts,
  6
);
assert.deepEqual(
  sparseRanking.map(({ slug, ranked, views, category }) => ({ slug, ranked, views, category })),
  [
    { slug: "render-optimization-checklist", ranked: true, views: 7, category: "图形渲染" },
    { slug: "start-here", ranked: false, views: 0, category: "随笔" },
    { slug: "game-team-toolchain", ranked: false, views: 0, category: "工具链" },
    { slug: "unity-performance-start", ranked: false, views: 0, category: "Unity" }
  ]
);

const db = new MockDatabase();
db.events.add("old-post:test-key:2000-01-01");

let response = await readJson(await onRequestGet(context(null, new Request("https://blog.solus.games/api/views"))));
assert.equal(response.status, 503);

response = await readJson(
  await onRequestPost(
    context(
      db,
      jsonRequest("POST", "https://blog.solus.games/api/views", { slug: "render-optimization-checklist" }, {
        Origin: "https://evil.example"
      })
    )
  )
);
assert.equal(response.status, 403);

response = await readJson(
  await onRequestPost(
    context(
      db,
      new Request("https://blog.solus.games/api/views", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "render-optimization-checklist"
      })
    )
  )
);
assert.equal(response.status, 415);

response = await readJson(
  await onRequestPost(context(db, jsonRequest("POST", "https://blog.solus.games/api/views", { slug: "../bad" })))
);
assert.equal(response.status, 400);

response = await readJson(
  await onRequestPost(context(db, jsonRequest("POST", "https://blog.solus.games/api/views", { slug: "Bad_Slug" })))
);
assert.equal(response.status, 400);

response = await readJson(
  await onRequestPost(
    context(db, viewRequest("render-optimization-checklist", "198.51.100.1"))
  )
);
assert.equal(response.status, 200);
assert.deepEqual(response.body, { slug: "render-optimization-checklist", views: 1 });
assert.equal([...db.events].some((key) => key.endsWith(":2000-01-01")), false);

response = await readJson(
  await onRequestPost(
    context(db, viewRequest("render-optimization-checklist", "198.51.100.1"))
  )
);
assert.equal(response.body.views, 1);

response = await readJson(
  await onRequestPost(
    context(db, viewRequest("render-optimization-checklist", "198.51.100.2"))
  )
);
assert.equal(response.body.views, 2);

response = await readJson(
  await onRequestGet(context(db, new Request("https://blog.solus.games/api/views?slug=render-optimization-checklist")))
);
assert.equal(response.status, 200);
assert.deepEqual(response.body, { slug: "render-optimization-checklist", views: 2 });

response = await readJson(
  await onRequestGet(
    context(db, new Request("https://blog.solus.games/api/views?slugs=render-optimization-checklist,unknown,../bad,Bad_Slug,中文,render-optimization-checklist"))
  )
);
assert.equal(response.status, 200);
assert.deepEqual(response.body.views, {
  "render-optimization-checklist": 2,
  unknown: 0
});

await onRequestPost(context(db, viewRequest("start-here", "198.51.100.3")));
await onRequestPost(context(db, viewRequest("game-team-toolchain", "198.51.100.4")));
await onRequestPost(context(db, viewRequest("game-team-toolchain", "198.51.100.5")));
await onRequestPost(context(db, viewRequest("game-team-toolchain", "198.51.100.6")));
db.rows.set("../bad", { slug: "../bad", views: 100, updatedAt: ++db.clock });

response = await readJson(await onRequestGet(context(db, new Request("https://blog.solus.games/api/views?top=2"))));
assert.equal(response.status, 200);
assert.deepEqual(response.body.ranking, [
  { slug: "game-team-toolchain", views: 3 },
  { slug: "render-optimization-checklist", views: 2 }
]);
assert.equal(response.body.ranking.some((entry) => entry.slug === "../bad"), false);

response = await readJson(await onRequestGet(context(db, new Request("https://blog.solus.games/api/views?top=5"))));
assert.equal(response.status, 200);
assert.deepEqual(response.body.ranking, [
  { slug: "game-team-toolchain", views: 3 },
  { slug: "render-optimization-checklist", views: 2 },
  { slug: "start-here", views: 1 }
]);
assert.equal(response.body.ranking.some((entry) => entry.slug === "../bad"), false);
assert.ok(db.statements.some((sql) => sql.includes("idx_post_views_ranking")));
assert.ok(db.statements.some((sql) => sql.includes("idx_post_view_events_date")));
assert.ok(db.statements.some((sql) => sql.includes("DELETE FROM post_view_events WHERE viewed_on < ?")));

const brokenDb = new BrokenDatabase();
response = await readJson(
  await onRequestGet(context(brokenDb, new Request("https://blog.solus.games/api/views?slug=render-optimization-checklist")))
);
assert.equal(response.status, 500);
assert.deepEqual(response.body, { error: "View counter storage is unavailable." });

response = await readJson(
  await onRequestPost(
    context(brokenDb, jsonRequest("POST", "https://blog.solus.games/api/views", { slug: "render-optimization-checklist" }))
  )
);
assert.equal(response.status, 500);
assert.deepEqual(response.body, { error: "View counter storage is unavailable." });

console.log("Views API tests passed.");
