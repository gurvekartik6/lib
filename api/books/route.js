import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const MAX_BATCH_SIZE = 500;
const MAX_PAGE_SIZE = 1000;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

async function ensureBooksTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS public.books (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT,
      isbn TEXT,
      department TEXT,
      year INTEGER,
      rack TEXT,
      shelf TEXT,
      copies INTEGER NOT NULL DEFAULT 1,
      available INTEGER NOT NULL DEFAULT 1,
      description TEXT,
      extra_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    ALTER TABLE public.books
    ADD COLUMN IF NOT EXISTS extra_data JSONB NOT NULL DEFAULT '{}'::jsonb
  `;
}

function normalizeBook(book) {
  const title = String(book?.title ?? '').trim();
  const id = String(book?.id ?? '').trim();

  if (!id || !title) return null;

  const parsedYear = Number.parseInt(book.year, 10);
  const parsedCopies = Number.parseInt(book.copies, 10);
  const parsedAvailable = Number.parseInt(book.available, 10);

  return {
    id,
    title,
    author: String(book.author ?? '').trim() || null,
    isbn: String(book.isbn ?? '').trim() || null,
    department: String(book.department ?? '').trim() || null,
    year: Number.isFinite(parsedYear) ? parsedYear : null,
    rack: String(book.rack ?? '').trim() || null,
    shelf: String(book.shelf ?? '').trim() || null,
    copies: Number.isFinite(parsedCopies)
      ? Math.max(0, parsedCopies)
      : 1,
    available: Number.isFinite(parsedAvailable)
      ? Math.max(0, parsedAvailable)
      : Number.isFinite(parsedCopies)
        ? Math.max(0, parsedCopies)
        : 1,
    description: String(book.description ?? '').trim() || null,

    // Preserve extra fields from the original CSV.
    extra_data: { ...book, id, title },
  };
}

function shapeBook(row) {
  const extra =
    row.extra_data && typeof row.extra_data === 'object'
      ? row.extra_data
      : {};

  const { extra_data, ...columns } = row;

  return { ...extra, ...columns };
}

export async function GET(request) {
  try {
    await ensureBooksTable();

    const url = new URL(request.url);

    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(
        1,
        Number.parseInt(url.searchParams.get('limit') || '500', 10) || 500
      )
    );

    const offset = Math.max(
      0,
      Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0
    );

    const q = String(url.searchParams.get('q') || '').trim();
    const pattern = `%${q}%`;

    const counts = await sql`
      SELECT COUNT(*)::int AS total
      FROM public.books
      WHERE (
        ${q} = ''
        OR title ILIKE ${pattern}
        OR COALESCE(author, '') ILIKE ${pattern}
        OR COALESCE(isbn, '') ILIKE ${pattern}
        OR COALESCE(department, '') ILIKE ${pattern}
        OR COALESCE(rack, '') ILIKE ${pattern}
        OR COALESCE(shelf, '') ILIKE ${pattern}
        OR id ILIKE ${pattern}
        OR extra_data::text ILIKE ${pattern}
      )
    `;

    const rows = await sql`
      SELECT
        id, title, author, isbn, department, year,
        rack, shelf, copies, available, description,
        extra_data, updated_at
      FROM public.books
      WHERE (
        ${q} = ''
        OR title ILIKE ${pattern}
        OR COALESCE(author, '') ILIKE ${pattern}
        OR COALESCE(isbn, '') ILIKE ${pattern}
        OR COALESCE(department, '') ILIKE ${pattern}
        OR COALESCE(rack, '') ILIKE ${pattern}
        OR COALESCE(shelf, '') ILIKE ${pattern}
        OR id ILIKE ${pattern}
        OR extra_data::text ILIKE ${pattern}
      )
      ORDER BY title ASC, id ASC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    return json({
      items: rows.map(shapeBook),
      total: counts[0]?.total || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('BOOKS_GET_ERROR', error);

    return json({
      ok: false,
      error: error?.message || 'Unable to load books',
    }, 500);
  }
}

export async function POST(request) {
  try {
    await ensureBooksTable();

    const body = await request.json();

    if (!body || !Array.isArray(body.books)) {
      return json({
        ok: false,
        error: 'Expected a books array',
      }, 400);
    }

    if (body.books.length > MAX_BATCH_SIZE) {
      return json({
        ok: false,
        error: `A maximum of ${MAX_BATCH_SIZE} books is allowed per request`,
      }, 413);
    }

    const normalizedBooks = body.books
      .map(normalizeBook)
      .filter(Boolean);

    const byId = new Map();

    normalizedBooks.forEach((book) => {
      byId.set(book.id, book);
    });

    const books = Array.from(byId.values());

    if (books.length === 0) {
      return json({ ok: true, saved: 0 });
    }

    await sql`
      INSERT INTO public.books (
        id, title, author, isbn, department, year,
        rack, shelf, copies, available, description,
        extra_data, updated_at
      )
      SELECT
        x.id,
        x.title,
        x.author,
        x.isbn,
        x.department,
        x.year,
        x.rack,
        x.shelf,
        COALESCE(x.copies, 1),
        COALESCE(x.available, 1),
        x.description,
        COALESCE(x.extra_data, '{}'::jsonb),
        NOW()
      FROM jsonb_to_recordset(
        ${JSON.stringify(books)}::jsonb
      ) AS x(
        id TEXT,
        title TEXT,
        author TEXT,
        isbn TEXT,
        department TEXT,
        year INTEGER,
        rack TEXT,
        shelf TEXT,
        copies INTEGER,
        available INTEGER,
        description TEXT,
        extra_data JSONB
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        author = EXCLUDED.author,
        isbn = EXCLUDED.isbn,
        department = EXCLUDED.department,
        year = EXCLUDED.year,
        rack = EXCLUDED.rack,
        shelf = EXCLUDED.shelf,
        copies = EXCLUDED.copies,
        available = EXCLUDED.available,
        description = EXCLUDED.description,
        extra_data = EXCLUDED.extra_data,
        updated_at = NOW()
    `;

    return json({
      ok: true,
      saved: books.length,
    });
  } catch (error) {
    console.error('BOOKS_POST_ERROR', error);

    return json({
      ok: false,
      error: error?.message || 'Unable to save books',
    }, 500);
  }
}

export async function DELETE(request) {
  try {
    await ensureBooksTable();

    const body = await request.json();

    if (body?.all === true) {
      await sql`DELETE FROM public.books`;

      return json({
        ok: true,
        deletedAll: true,
      });
    }

    const id = String(body?.id ?? '').trim();

    if (!id) {
      return json({
        ok: false,
        error: 'Book id is required',
      }, 400);
    }

    const result = await sql`
      DELETE FROM public.books
      WHERE id = ${id}
      RETURNING id
    `;

    return json({
      ok: true,
      deleted: result.length > 0,
    });
  } catch (error) {
    console.error('BOOKS_DELETE_ERROR', error);

    return json({
      ok: false,
      error: error?.message || 'Unable to delete book',
    }, 500);
  }
}