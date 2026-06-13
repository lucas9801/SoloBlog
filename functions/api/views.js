const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
};

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS post_views (
  slug TEXT PRIMARY KEY,
  views INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;
const CREATE_RANKING_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_post_views_ranking
ON post_views (views DESC, updated_at DESC)`;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS
  });
}

function sanitizeSlug(value) {
  const slug = String(value || "").trim();
  if (!/^[\p{Letter}\p{Number}_-]{1,180}$/u.test(slug)) return "";
  return slug;
}

function parseSlugs(request) {
  const url = new URL(request.url);
  const multiple = url.searchParams.get("slugs");
  const single = url.searchParams.get("slug");
  const raw = multiple ? multiple.split(",") : single ? [single] : [];
  return Array.from(new Set(raw.map(sanitizeSlug).filter(Boolean))).slice(0, 80);
}

function parseTop(request) {
  const url = new URL(request.url);
  const top = Number.parseInt(url.searchParams.get("top") || "0", 10);
  return Number.isFinite(top) ? Math.min(Math.max(top, 0), 20) : 0;
}

function isSameOriginRequest(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;

  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

function isJsonRequest(request) {
  const contentType = request.headers.get("Content-Type") || "";
  return contentType.toLowerCase().split(";")[0].trim() === "application/json";
}

function getDatabase(context) {
  return context.env.BLOG_DB || null;
}

async function ensureSchema(db) {
  await db.prepare(CREATE_TABLE_SQL).run();
  await db.prepare(CREATE_RANKING_INDEX_SQL).run();
}

export async function onRequestGet(context) {
  const db = getDatabase(context);
  if (!db) return json({ error: "BLOG_DB binding is not configured." }, 503);

  const top = parseTop(context.request);
  if (top > 0) {
    await ensureSchema(db);
    const result = await db
      .prepare("SELECT slug, views FROM post_views ORDER BY views DESC, updated_at DESC LIMIT ?")
      .bind(top)
      .all();
    return json({
      ranking: (result.results || []).map((row) => ({
        slug: row.slug,
        views: Number(row.views) || 0
      }))
    });
  }

  const slugs = parseSlugs(context.request);
  if (slugs.length === 0) return json({ views: {} });

  await ensureSchema(db);

  const counts = Object.fromEntries(slugs.map((slug) => [slug, 0]));
  const placeholders = slugs.map(() => "?").join(", ");
  const result = await db
    .prepare(`SELECT slug, views FROM post_views WHERE slug IN (${placeholders})`)
    .bind(...slugs)
    .all();

  for (const row of result.results || []) {
    counts[row.slug] = Number(row.views) || 0;
  }

  if (slugs.length === 1) {
    const slug = slugs[0];
    return json({ slug, views: counts[slug] });
  }

  return json({ views: counts });
}

export async function onRequestPost(context) {
  if (!isSameOriginRequest(context.request)) {
    return json({ error: "Cross-origin view updates are not allowed." }, 403);
  }
  if (!isJsonRequest(context.request)) {
    return json({ error: "Expected application/json request body." }, 415);
  }

  const db = getDatabase(context);
  if (!db) return json({ error: "BLOG_DB binding is not configured." }, 503);

  const body = await context.request.json().catch(() => ({}));
  const slug = sanitizeSlug(body.slug);
  if (!slug) return json({ error: "Invalid post slug." }, 400);

  await ensureSchema(db);
  await db
    .prepare(
      `INSERT INTO post_views (slug, views, updated_at)
       VALUES (?, 1, CURRENT_TIMESTAMP)
       ON CONFLICT(slug) DO UPDATE SET
         views = views + 1,
         updated_at = CURRENT_TIMESTAMP`
    )
    .bind(slug)
    .run();

  const row = await db.prepare("SELECT views FROM post_views WHERE slug = ?").bind(slug).first();
  return json({ slug, views: Number(row?.views) || 1 });
}
