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
const CREATE_EVENTS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS post_view_events (
  slug TEXT NOT NULL,
  viewer_key TEXT NOT NULL,
  viewed_on TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (slug, viewer_key, viewed_on)
)`;
const CREATE_EVENTS_DATE_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_post_view_events_date
ON post_view_events (viewed_on)`;
const VIEW_EVENT_RETENTION_DAYS = 2;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS
  });
}

function storageError() {
  return json({ error: "View counter storage is unavailable." }, 500);
}

function sanitizeSlug(value) {
  const slug = String(value || "").trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return "";
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
  return context.env?.BLOG_DB || null;
}

async function ensureSchema(db) {
  await db.prepare(CREATE_TABLE_SQL).run();
  await db.prepare(CREATE_RANKING_INDEX_SQL).run();
  await db.prepare(CREATE_EVENTS_TABLE_SQL).run();
  await db.prepare(CREATE_EVENTS_DATE_INDEX_SQL).run();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function dateIsoOffset(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function clientAddress(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Real-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    ""
  );
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function viewerKey(context) {
  const request = context.request;
  const host = new URL(request.url).host;
  const salt = context.env?.VIEW_SALT || host;
  const userAgent = request.headers.get("User-Agent") || "";
  const language = request.headers.get("Accept-Language") || "";
  return sha256Hex([salt, clientAddress(request), userAgent.slice(0, 240), language.slice(0, 120)].join("|"));
}

function mutationChanged(result) {
  const changes = result?.meta?.changes ?? result?.changes;
  return changes === undefined ? true : Number(changes) > 0;
}

async function pruneOldViewEvents(db) {
  const cutoff = dateIsoOffset(-VIEW_EVENT_RETENTION_DAYS);
  await db.prepare("DELETE FROM post_view_events WHERE viewed_on < ?").bind(cutoff).run();
}

async function recordView(db, context, slug) {
  const key = await viewerKey(context);
  const viewedOn = todayIso();
  const event = await db
    .prepare(
      `INSERT OR IGNORE INTO post_view_events (slug, viewer_key, viewed_on)
       VALUES (?, ?, ?)`
    )
    .bind(slug, key, viewedOn)
    .run();

  if (mutationChanged(event)) {
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
  }

  await pruneOldViewEvents(db);

  const row = await db.prepare("SELECT views FROM post_views WHERE slug = ?").bind(slug).first();
  return Number(row?.views) || 0;
}

export async function onRequestGet(context) {
  const db = getDatabase(context);
  if (!db) return json({ error: "BLOG_DB binding is not configured." }, 503);

  const top = parseTop(context.request);
  if (top > 0) {
    try {
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
    } catch {
      return storageError();
    }
  }

  const slugs = parseSlugs(context.request);
  if (slugs.length === 0) return json({ views: {} });

  try {
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
  } catch {
    return storageError();
  }
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

  try {
    await ensureSchema(db);
    const views = await recordView(db, context, slug);
    return json({ slug, views });
  } catch {
    return storageError();
  }
}
