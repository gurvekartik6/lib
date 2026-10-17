import React, { useRef, useState } from 'react';
import {
  Plus,
  Trash2,
  Pencil,
  Upload,
  X,
  Search,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

import { useLibrary } from '../../context/LibraryContext';
import {
  ManagerForm,
  DataTable,
  Field,
  AdminPage
} from '../../components/admin';

const emptyForm = {
  title: '',
  author: '',
  department: '',
  year: '',
  isbn: '',
  copies: '',
  available: '',
  rack: '',
  shelf: '',
  description: ''
};

const normalizeBook = (book, index = 0) => ({
  ...book,
  id:
    book.id ||
    `b${Date.now()}${index}`,
  title: String(book.title || '').trim(),
  author: String(book.author || '').trim(),
  department: String(
    book.department || ''
  ).trim(),
  year: Number(book.year) || new Date().getFullYear(),
  isbn: String(book.isbn || '').trim(),
  copies: Number(book.copies) || 0,
  available:
    book.available !== undefined &&
    book.available !== ''
      ? Number(book.available) || 0
      : Number(book.copies) || 0,
  rack: String(book.rack || '').trim(),
  shelf: String(book.shelf || '').trim(),
  description:
    String(book.description || '').trim() ||
    'Catalogue record added by library administrator.'
});

export default function ManageBooks() {
  const {
    books,
    setBooks,
    departments,
    setToast,
    saveContent
  } = useLibrary();

  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    ...emptyForm,
    department:
      departments[0]?.name || ''
  });

  const [editingId, setEditingId] =
    useState(null);

  const [importing, setImporting] =
    useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const updateField = (
    field,
    value
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  };

  const resetForm = () => {
    setEditingId(null);

    setForm({
      ...emptyForm,
      department:
        departments[0]?.name || ''
    });
  };

  const add = async (e) => {
    e.preventDefault();

    if (!form.title.trim()) {
      return;
    }

    const newBook = normalizeBook({
      ...form,
      id: `b${Date.now()}`,
      year:
        form.year ||
        new Date().getFullYear(),
      copies:
        form.copies === ''
          ? 1
          : form.copies,
      available:
        form.available === ''
          ? form.copies === ''
            ? 1
            : form.copies
          : form.available
    });

    const nextBooks = [
      newBook,
      ...books
    ];

    setBooks(nextBooks);

    try {
      await saveContent({
        books: nextBooks
      });

      resetForm();
      setToast(
        'Catalogue record added'
      );
    } catch {
      // saveContent already shows the error toast
    }
  };

  const startEdit = (book) => {
    setEditingId(book.id);

    setForm({
      title: book.title || '',
      author: book.author || '',
      department:
        book.department ||
        departments[0]?.name ||
        '',
      year:
        book.year !== undefined
          ? String(book.year)
          : '',
      isbn: book.isbn || '',
      copies:
        book.copies !== undefined
          ? String(book.copies)
          : '',
      available:
        book.available !== undefined
          ? String(book.available)
          : '',
      rack: book.rack || '',
      shelf: book.shelf || '',
      description:
        book.description || ''
    });

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  const updateBook = async (e) => {
    e.preventDefault();

    if (
      !editingId ||
      !form.title.trim()
    ) {
      return;
    }

    const updatedBooks =
      books.map((book) => {
        if (book.id !== editingId) {
          return book;
        }

        return normalizeBook({
          ...form,
          id: book.id
        });
      });

    setBooks(updatedBooks);

    try {
      await saveContent({
        books: updatedBooks
      });

      resetForm();
      setToast(
        'Catalogue record updated'
      );
    } catch {
      // saveContent already shows the error toast
    }
  };

  const removeBook = async (id) => {
    const nextBooks =
      books.filter(
        (book) => book.id !== id
      );

    setBooks(nextBooks);

    try {
      await saveContent({
        books: nextBooks
      });

      if (editingId === id) {
        resetForm();
      }

      setToast(
        'Catalogue record removed'
      );
    } catch {
      // saveContent already shows the error toast
    }
  };

  const parseCSV = (text) => {
    const rows = [];
    let row = [];
    let value = '';
    let insideQuotes = false;

    for (
      let i = 0;
      i < text.length;
      i += 1
    ) {
      const char = text[i];
      const next = text[i + 1];

      if (char === '"') {
        if (
          insideQuotes &&
          next === '"'
        ) {
          value += '"';
          i += 1;
        } else {
          insideQuotes =
            !insideQuotes;
        }
      } else if (
        char === ',' &&
        !insideQuotes
      ) {
        row.push(value);
        value = '';
      } else if (
        (char === '\n' ||
          char === '\r') &&
        !insideQuotes
      ) {
        if (
          char === '\r' &&
          next === '\n'
        ) {
          i += 1;
        }

        row.push(value);
        value = '';

        if (
          row.some(
            (cell) =>
              cell.trim() !== ''
          )
        ) {
          rows.push(row);
        }

        row = [];
      } else {
        value += char;
      }
    }

    if (
      value !== '' ||
      row.length > 0
    ) {
      row.push(value);

      if (
        row.some(
          (cell) =>
            cell.trim() !== ''
        )
      ) {
        rows.push(row);
      }
    }

    if (rows.length < 2) {
      return [];
    }

    const normalizeHeader = (header) =>
      String(header || '')
        .replace(/^\\uFEFF/, '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

    const headers = rows[0].map(normalizeHeader);
    const aliases = {
      title: ['title', 'booktitle', 'bookname', 'name', 'itemtitle', 'descriptionoftitle'],
      author: ['author', 'authors', 'authorname', 'creator'],
      department: ['department', 'dept', 'subject', 'category', 'branch'],
      year: ['year', 'publicationyear', 'published', 'yearofpublication'],
      isbn: ['isbn', 'isbnnumber', 'isbn13', 'isbn10'],
      copies: ['copies', 'totalcopies', 'quantity', 'qty', 'numberofcopies'],
      available: ['available', 'availablecopies', 'availability'],
      rack: ['rack', 'rackno', 'racknumber', 'location'],
      shelf: ['shelf', 'shelfno', 'shelfnumber'],
      barcode: ['barcode', 'barcodeno', 'barcodenumber', 'accessionno', 'accessionnumber', 'accession'],
      id: ['id', 'bookid', 'recordid', 'itemid'],
    };
    const findHeader = (field) =>
      headers.findIndex((header) => aliases[field]?.includes(header));

    return rows
      .slice(1)
      .map((cells, index) => {
        const record = {};
        headers.forEach((header, columnIndex) => {
          record[header || `column${columnIndex + 1}`] =
            String(cells[columnIndex] ?? '').trim();
        });

        Object.entries(aliases).forEach(([field]) => {
          const columnIndex = findHeader(field);
          if (columnIndex >= 0) {
            record[field] = String(cells[columnIndex] ?? '').trim();
          }
        });

        // Keep every original CSV column so barcode/accession metadata is not lost.
        record.csvData = Object.fromEntries(
          headers.map((header, columnIndex) => [
            header || `column${columnIndex + 1}`,
            String(cells[columnIndex] ?? '').trim(),
          ])
        );

        if (!record.title) {
          record.title =
            record.csvData.booktitle ||
            record.csvData.bookname ||
            record.csvData.name ||
            record.csvData.title ||
            '';
        }

        const stableKey = record.barcode || record.isbn ||
          `${record.title}|${record.author}|${record.department}|${index}`;
        return normalizeBook({
          ...record,
          id: record.id || `csv-${stableKey}`,
          copies: record.copies === '' ? 1 : record.copies,
          available: record.available === '' ? record.copies || 1 : record.available,
        }, index);
      })
      .filter((book) => book.title);
  };

  const importCSV = async (e) => {
    const file =
      e.target.files?.[0];

    if (!file) {
      return;
    }

    setImporting(true);

    try {
      const text =
        await file.text();

      const importedBooks =
        parseCSV(text);

      if (!importedBooks.length) {
        setToast(
          'No valid catalogue records found in CSV'
        );
        return;
      }

      // Append imported records and update matching ISBN/barcode records.
      // Existing catalogue entries are retained.
      const keyOf = (book) => {
        const barcode = String(book.barcode || book.accession || '').trim().toLowerCase();
        const isbn = String(book.isbn || '').replace(/[^0-9x]/gi, '').toLowerCase();
        if (barcode) return `barcode:${barcode}`;
        if (isbn) return `isbn:${isbn}`;
        return `title-author:${String(book.title || '').trim().toLowerCase()}|${String(book.author || '').trim().toLowerCase()}`;
      };

      const mergedByKey = new Map();
      books.forEach((book) => mergedByKey.set(keyOf(book), book));
      let addedCount = 0;
      let updatedCount = 0;

      importedBooks.forEach((book, index) => {
        const key = keyOf(book);
        const existing = mergedByKey.get(key);
        const nextRecord = {
          ...existing,
          ...book,
          id: existing?.id || book.id || `csv-${Date.now()}-${index}`,
        };
        if (existing) updatedCount += 1;
        else addedCount += 1;
        mergedByKey.set(key, nextRecord);
      });

      const nextBooks = Array.from(mergedByKey.values());
      setBooks(nextBooks);

      await saveContent({
        books: nextBooks
      });

      resetForm();

      setToast(
        `CSV processed: ${addedCount} added, ${updatedCount} updated. Total catalogue records: ${nextBooks.length}.`
      );
    } catch (error) {
      console.error(
        'CSV_IMPORT_ERROR',
        error
      );

      setToast(
        'Unable to import CSV file'
      );
    } finally {
      setImporting(false);

      if (fileInputRef.current) {
        fileInputRef.current.value =
          '';
      }
    }
  };

  const searchableValue = (book) => [
    book.title,
    book.author,
    book.isbn,
    book.barcode,
    book.accession,
    book.department,
    book.rack,
    book.shelf,
    book.id,
    ...(book.csvData ? Object.values(book.csvData) : []),
  ].filter(Boolean).join(' ').toLowerCase();

  const filteredBooks = searchQuery.trim()
    ? books.filter((book) => searchableValue(book).includes(searchQuery.trim().toLowerCase()))
    : books;

  const totalPages = Math.max(1, Math.ceil(filteredBooks.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const visibleBooks = filteredBooks.slice((safePage - 1) * pageSize, safePage * pageSize);

  const runSearch = (e) => {
    e?.preventDefault();
    setSearchQuery(searchInput.trim());
    setCurrentPage(1);
  };

  return (
    <AdminPage
      eyebrow="CATALOGUE"
      title="Manage books"
    >
      <ManagerForm
        title={
          editingId
            ? 'Edit catalogue record'
            : 'Add catalogue record'
        }
        onSubmit={
          editingId
            ? updateBook
            : add
        }
      >
        <Field label="Title">
          <input
            required
            value={form.title}
            onChange={(e) =>
              updateField(
                'title',
                e.target.value
              )
            }
            placeholder="Book title"
          />
        </Field>

        <Field label="Author">
          <input
            value={form.author}
            onChange={(e) =>
              updateField(
                'author',
                e.target.value
              )
            }
            placeholder="Author name"
          />
        </Field>

        <Field label="Department">
          <select
            value={form.department}
            onChange={(e) =>
              updateField(
                'department',
                e.target.value
              )
            }
          >
            {departments.map(
              (department) => (
                <option
                  key={department.name}
                  value={department.name}
                >
                  {department.name}
                </option>
              )
            )}
          </select>
        </Field>

        <Field label="Publication Year">
          <input
            type="number"
            min="0"
            value={form.year}
            onChange={(e) =>
              updateField(
                'year',
                e.target.value
              )
            }
            placeholder="e.g. 2024"
          />
        </Field>

        <Field label="ISBN">
          <input
            value={form.isbn}
            onChange={(e) =>
              updateField(
                'isbn',
                e.target.value
              )
            }
            placeholder="e.g. 9780199455681"
          />
        </Field>

        <Field label="Total Copies">
          <input
            type="number"
            min="0"
            value={form.copies}
            onChange={(e) =>
              updateField(
                'copies',
                e.target.value
              )
            }
            placeholder="e.g. 4"
          />
        </Field>

        <Field label="Available Copies">
          <input
            type="number"
            min="0"
            value={form.available}
            onChange={(e) =>
              updateField(
                'available',
                e.target.value
              )
            }
            placeholder="e.g. 3"
          />
        </Field>

        <Field label="Rack">
          <input
            value={form.rack}
            onChange={(e) =>
              updateField(
                'rack',
                e.target.value
              )
            }
            placeholder="e.g. CS-01"
          />
        </Field>

        <Field label="Shelf">
          <input
            value={form.shelf}
            onChange={(e) =>
              updateField(
                'shelf',
                e.target.value
              )
            }
            placeholder="e.g. 01"
          />
        </Field>

        <Field label="Description">
          <textarea
            rows="3"
            value={form.description}
            onChange={(e) =>
              updateField(
                'description',
                e.target.value
              )
            }
            placeholder="Book description"
          />
        </Field>

        <div
          style={{
            display: 'flex',
            gap: '10px',
            flexWrap: 'wrap'
          }}
        >
          <button
            type="submit"
            className="primary-btn full"
          >
            {editingId ? (
              <Pencil size={16} />
            ) : (
              <Plus size={16} />
            )}

            {editingId
              ? 'Update book'
              : 'Add book'}
          </button>

          {editingId && (
            <button
              type="button"
              className="danger"
              onClick={resetForm}
              title="Cancel editing"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </ManagerForm>

      <div
        style={{
          marginBottom: '24px'
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={importCSV}
          style={{ display: 'none' }}
        />

        <button
          type="button"
          className="primary-btn"
          onClick={() =>
            fileInputRef.current?.click()
          }
          disabled={importing}
        >
          <Upload size={16} />

          {importing
            ? 'Importing CSV...'
            : 'Import CSV'}
        </button>
      </div>

      <form
        onSubmit={runSearch}
        style={{
          display: 'flex',
          gap: '10px',
          flexWrap: 'wrap',
          alignItems: 'center',
          margin: '20px 0 12px',
        }}
      >
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search title, author, ISBN, barcode, rack..."
          aria-label="Search books"
          style={{ flex: '1 1 320px', minWidth: 0 }}
        />
        <button type="submit" className="primary-btn">
          <Search size={16} /> Search books
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => {
            setSearchInput('');
            setSearchQuery('');
            setCurrentPage(1);
          }}
        >
          Clear
        </button>
      </form>

      <p style={{ margin: '8px 0 14px' }}>
        Showing {filteredBooks.length ? (safePage - 1) * pageSize + 1 : 0}–{Math.min(safePage * pageSize, filteredBooks.length)}
        {' '}of {filteredBooks.length.toLocaleString()} matching records
        {' '}({books.length.toLocaleString()} total).
      </p>

      <DataTable
        headers={[
          'Book',
          'Department',
          'Availability',
          'Action'
        ]}
        rows={visibleBooks.map((book) => (
          <React.Fragment
            key={book.id}
          >
            <td>
              <b>{book.title}</b>
              <small>
                {book.author}
              </small>
            </td>

            <td>
              {book.department}
            </td>

            <td>
              {book.available}/
              {book.copies}
            </td>

            <td>
              <div
                style={{
                  display: 'flex',
                  gap: '8px'
                }}
              >
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() =>
                    startEdit(book)
                  }
                  title="Edit book"
                >
                  <Pencil size={14} />
                </button>

                <button
                  type="button"
                  className="danger"
                  onClick={() =>
                    removeBook(book.id)
                  }
                  title="Remove book"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </td>
          </React.Fragment>
        ))}
      />

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginTop: '16px' }}>
        <label style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          Rows per page
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button type="button" className="primary-btn" disabled={safePage <= 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>
            <ChevronLeft size={16} /> Previous
          </button>
          <span>Page {safePage} of {totalPages}</span>
          <button type="button" className="primary-btn" disabled={safePage >= totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>
            Next <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </AdminPage>
  );
}
