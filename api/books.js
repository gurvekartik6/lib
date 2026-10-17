
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

function json(res, status, data) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(data);
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
}

function normalizeBook(book, index) {
  const title = String(book.title ?? book.Title ?? '').trim();
  const id = String(
    book.id ?? book._id ?? book.barcode ?? book.accessionNumber ??
    book.isbn ?? `book-${Date.now()}-${index}`
  ).trim();

  const standardFields = new Set([
    'id', '_id', 'title', 'Title', 'author', 'Author',
    'isbn', 'ISBN', 'department', 'Department', 'year', 'Year',
    'rack', 'Rack', 'shelf', 'Shelf', 'copies', 'Copies',
    'available', 'Available', 'description', 'Description',
    'extra_data', 'updated_at'
  ]);

  const extra = Object.fromEntries(
    Object.entries(book).filter(([key]) => !standardFields.has(key))
  );

  const integer = (value, fallback) => {
    const number = Number.parseInt(value, 10);
    return Number.isFinite(number) ? number : fallback;
  };

  return {
    id,
    title,
    author: String(book.author ?? book.Author ?? ''),
    isbn: String(book.isbn ?? book.ISBN ?? ''),
    department: String(book.department ?? book.Department ?? ''),
    year: integer(book.year ?? book.Year, null),
    rack: String(book.rack ?? book.Rack ?? ''),
    shelf: String(book.shelf ?? book.Shelf ?? ''),
    copies: Math.max(0, integer(book.copies ?? book.Copies, 1)),
    available: Math.max(0, integer(book.available ?? book.Available, 1)),
    description: String(book.description ?? book.Description ?? ''),
    extra_data: JSON.stringify({
      ...extra,
      ...(book.extra_data && typeof book.extra_data === 'object'
        ? book.extra_data
        : {})
    })
  };
}

export default async function handler(req, res) {
  try {
    // IMPORTANT: Add your existing server-side admin-session
    // verification here before allowing database mutations.
    // Do not rely only on the presence of a cookie.

    await ensureBooksTable();

    if (req.method === 'GET') {
      const limit = Math.min(
        1000,
        Math.max(1, Number.parseInt(req.query.limit, 10) || 100)
      );
      const offset = Math.max(
        0,
        Number.parseInt(req.query.offset, 10) || 0
      );
      const q = String(req.query.q || '').trim();

      const countRows = await sql`
        SELECT COUNT(*)::int AS total
        FROM public.books
        WHERE ${q} = ''
          OR title ILIKE ${'%' + q + '%'}
          OR author ILIKE ${'%' + q + '%'}
          OR isbn ILIKE ${'%' + q + '%'}
          OR department ILIKE ${'%' + q + '%'}
          OR id ILIKE ${'%' + q + '%'}
      `;

      const rows = await sql`
        SELECT *
        FROM public.books
        WHERE ${q} = ''
          OR title ILIKE ${'%' + q + '%'}
          OR author ILIKE ${'%' + q + '%'}
          OR isbn ILIKE ${'%' + q + '%'}
          OR department ILIKE ${'%' + q + '%'}
          OR id ILIKE ${'%' + q + '%'}
        ORDER BY title, id
        LIMIT ${limit}
        OFFSET ${offset}
      `;

      const items = rows.map(({ extra_data, ...book }) => ({
        ...(
          extra_data && typeof extra_data === 'object'
            ? extra_data
            : {}
        ),
        ...book
      }));

      return json(res, 200, {
        items,
        total: countRows[0].total,
        limit,
        offset
      });
    }

    if (req.method === 'POST') {
      const body = req.body;

      if (!body || !Array.isArray(body.books)) {
        return json(res, 400, {
          ok: false,
          error: 'Expected { "books": [...] }'
        });
      }

      if (body.books.length > 500) {
        return json(res, 413, {
          ok: false,
          error: 'Maximum 500 books per request'
        });
      }

      if (body.books.length === 0) {
        return json(res, 200, { ok: true, count: 0 });
      }

      const books = body.books.map(normalizeBook);

      if (books.some(book => !book.id || !book.title)) {
        return json(res, 400, {
          ok: false,
          error: 'Every book must have an ID and title'
        });
      }

      const payload = JSON.stringify(books);

      await sql`
        INSERT INTO public.books (
          id, title, author, isbn, department, year,
          rack, shelf, copies, available, description,
          extra_data, updated_at
        )
        SELECT
          b.id, b.title, b.author, b.isbn, b.department, b.year,
          b.rack, b.shelf, b.copies, b.available, b.description,
          b.extra_data, NOW()
        FROM jsonb_to_recordset(${payload}::jsonb) AS b(
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

      return json(res, 200, {
        ok: true,
        count: books.length
      });
    }

    if (req.method === 'DELETE') {
      const body = req.body || {};

      if (body.all === true) {
        await sql`DELETE FROM public.books`;
        return json(res, 200, { ok: true, deleted: 'all' });
      }

      if (body.id) {
        const rows = await sql`
          DELETE FROM public.books
          WHERE id = ${String(body.id)}
          RETURNING id
        `;

        return json(res, 200, {
          ok: true,
          deleted: rows.length
        });
      }

      return json(res, 400, {
        ok: false,
        error: 'Provide an id or all: true'
      });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return json(res, 405, {
      ok: false,
      error: 'Method not allowed'
    });
  } catch (error) {
    console.error('BOOKS_API_ERROR', error);

    return json(res, 500, {
      ok: false,
      error: 'Books API request failed'
    });
  }
}
