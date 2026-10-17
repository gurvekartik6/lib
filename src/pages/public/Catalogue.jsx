
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';

import {
  PageHero,
  BookCard,
  Empty,
} from '../../components/site';

const PAGE_SIZE = 24;

export default function Catalogue() {
  const [params] = useSearchParams();

  const [q, setQ] = useState(params.get('q') || '');
  const [page, setPage] = useState(0);
  const [books, setBooks] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');

      try {
        const query = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(page * PAGE_SIZE),
          q: q.trim(),
        });

        const response = await fetch(
          `/api/books?${query.toString()}`,
          {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error(
            `Unable to load catalogue (${response.status}).`
          );
        }

        const data = await response.json();

        if (!Array.isArray(data.items)) {
          throw new Error('Invalid catalogue response.');
        }

        if (active) {
          setBooks(data.items);
          setTotal(Number(data.total) || 0);
        }
      } catch (err) {
        if (active && err.name !== 'AbortError') {
          console.error('Catalogue loading failed:', err);
          setBooks([]);
          setTotal(0);
          setError(err.message || 'Unable to load books.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, page]);

  const totalPages = Math.max(
    1,
    Math.ceil(total / PAGE_SIZE)
  );

  const handleSearch = (event) => {
    setQ(event.target.value);
    setPage(0);
  };

  return (
    <>
      <PageHero
        eyebrow="CATALOGUE"
        title="Find your next book"
        text="Search the Shri Guru Gobind Singhji Institute of Engineering & Technology Central Library catalogue by title, author or department."
        image="/images/bookshelves.jpg"
      />

      <section className="container section">
        <div className="filter-bar">
          <Search />

          <input
            type="search"
            value={q}
            onChange={handleSearch}
            placeholder="Search catalogue..."
            aria-label="Search books by title, author or department"
          />

          <span>
            {loading
              ? 'Loading...'
              : `${total.toLocaleString()} records`}
          </span>
        </div>

        {error ? (
          <Empty
            title="Catalogue unavailable"
            text={`${error} Please try again shortly.`}
          />
        ) : loading && books.length === 0 ? (
          <p role="status" aria-live="polite">
            Loading catalogue...
          </p>
        ) : books.length > 0 ? (
          <>
            <div className="book-grid">
              {books.map((book) => (
                <BookCard
                  book={book}
                  key={book.id}
                />
              ))}
            </div>

            <div
              className="catalogue-pagination"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '16px',
                flexWrap: 'wrap',
                marginTop: '28px',
              }}
            >
              <button
                type="button"
                onClick={() =>
                  setPage((current) => Math.max(0, current - 1))
                }
                disabled={page === 0 || loading}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '10px 16px',
                  cursor: page === 0 || loading
                    ? 'not-allowed'
                    : 'pointer',
                }}
              >
                <ChevronLeft size={18} />
                Previous
              </button>

              <span>
                Page {page + 1} of {totalPages}
              </span>

              <button
                type="button"
                onClick={() =>
                  setPage((current) =>
                    Math.min(totalPages - 1, current + 1)
                  )
                }
                disabled={page >= totalPages - 1 || loading}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '10px 16px',
                  cursor:
                    page >= totalPages - 1 || loading
                      ? 'not-allowed'
                      : 'pointer',
                }}
              >
                Next
                <ChevronRight size={18} />
              </button>
            </div>
          </>
        ) : !loading ? (
          <Empty
            title="No catalogue records found"
            text="Try a different title, author or department."
          />
        ) : null}
      </section>
    </>
  );
}
