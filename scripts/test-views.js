import assert from "node:assert/strict";
import { onRequestGet, onRequestPost } from "../functions/api/views.js";

class MockDatabase {
  constructor() {
    this.rows = new Map();
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

async function readJson(response) {
  return {
    status: response.status,
    body: await response.json()
  };
}

const db = new MockDatabase();

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
  await onRequestPost(
    context(db, jsonRequest("POST", "https://blog.solus.games/api/views", { slug: "render-optimization-checklist" }))
  )
);
assert.equal(response.status, 200);
assert.deepEqual(response.body, { slug: "render-optimization-checklist", views: 1 });

response = await readJson(
  await onRequestPost(
    context(db, jsonRequest("POST", "https://blog.solus.games/api/views", { slug: "render-optimization-checklist" }))
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
    context(db, new Request("https://blog.solus.games/api/views?slugs=render-optimization-checklist,unknown,../bad,render-optimization-checklist"))
  )
);
assert.equal(response.status, 200);
assert.deepEqual(response.body.views, {
  "render-optimization-checklist": 2,
  unknown: 0
});

await onRequestPost(context(db, jsonRequest("POST", "https://blog.solus.games/api/views", { slug: "start-here" })));
await onRequestPost(context(db, jsonRequest("POST", "https://blog.solus.games/api/views", { slug: "game-team-toolchain" })));
await onRequestPost(context(db, jsonRequest("POST", "https://blog.solus.games/api/views", { slug: "game-team-toolchain" })));
await onRequestPost(context(db, jsonRequest("POST", "https://blog.solus.games/api/views", { slug: "game-team-toolchain" })));

response = await readJson(await onRequestGet(context(db, new Request("https://blog.solus.games/api/views?top=2"))));
assert.equal(response.status, 200);
assert.deepEqual(response.body.ranking, [
  { slug: "game-team-toolchain", views: 3 },
  { slug: "render-optimization-checklist", views: 2 }
]);
assert.ok(db.statements.some((sql) => sql.includes("idx_post_views_ranking")));

console.log("Views API tests passed.");
