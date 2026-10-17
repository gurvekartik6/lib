import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

const DEFAULT_CONTENT = {
  books: [],
  departments: [],
  resources: [],
  papers: [],
  announcements: [],
  publications: [],
  site: {},
};

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS library_content (
      id INTEGER PRIMARY KEY,
      content JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

export async function GET() {
  try {
    await ensureTable();

    const rows = await sql`
      SELECT content
      FROM library_content
      WHERE id = 1
      LIMIT 1
    `;

    if (rows.length === 0) {
      await sql`
        INSERT INTO library_content (id, content)
        VALUES (1, ${JSON.stringify(DEFAULT_CONTENT)}::jsonb)
        ON CONFLICT (id) DO NOTHING
      `;

      return json(DEFAULT_CONTENT);
    }

    return json(rows[0].content);
  } catch (error) {
    console.error('CONTENT_GET_ERROR', error);

    return json({
      ok: false,
      error: error?.message || 'Unable to load content',
    }, 500);
  }
}

export async function POST(request) {
  try {
    await ensureTable();

    const body = await request.json();

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json({
        ok: false,
        error: 'Invalid content payload',
      }, 400);
    }

    // Keep legacy books unless this request explicitly supplies books.
    // New catalogue records are stored separately through /api/books.
    const existingRows = await sql`
      SELECT content
      FROM library_content
      WHERE id = 1
      LIMIT 1
    `;

    const existingContent = existingRows[0]?.content || DEFAULT_CONTENT;

    const legacyBooks = Array.isArray(body.books)
      ? body.books
      : Array.isArray(existingContent.books)
        ? existingContent.books
        : [];

    const content = {
      books: legacyBooks,
      departments: Array.isArray(body.departments)
        ? body.departments
        : [],
      resources: Array.isArray(body.resources)
        ? body.resources
        : [],
      papers: Array.isArray(body.papers)
        ? body.papers
        : [],
      announcements: Array.isArray(body.announcements)
        ? body.announcements
        : [],
      publications: Array.isArray(body.publications)
        ? body.publications
        : [],
      site:
        body.site &&
        typeof body.site === 'object' &&
        !Array.isArray(body.site)
          ? body.site
          : {},
    };

    await sql`
      INSERT INTO library_content (id, content, updated_at)
      VALUES (1, ${JSON.stringify(content)}::jsonb, NOW())
      ON CONFLICT (id) DO UPDATE
      SET
        content = EXCLUDED.content,
        updated_at = NOW()
    `;

    return json({
      ok: true,
      data: content,
    });
  } catch (error) {
    console.error('CONTENT_POST_ERROR', error);

    return json({
      ok: false,
      error: error?.message || 'Unable to save content',
    }, 500);
  }
}