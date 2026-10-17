import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  defaultAnnouncements,
  defaultBooks,
  // defaultPapers,
  defaultResources,
  defaultPublications,
  defaultSite,
  departments,
  years,
  semesters,
} from '../data/defaultData';

const Ctx = createContext(null);

/*
 * =========================================================
 * CONFIGURATION
 * =========================================================
 */

const BOOKS_API = '/api/books';
const CONTENT_API = '/api/content';

const BOOK_PAGE_SIZE = 1000;
const BOOK_BATCH_SIZE = 500;
const BOOK_SAVE_CONCURRENCY = 4;

/*
 * =========================================================
 * SAFE LOCAL STORAGE HELPERS
 * =========================================================
 */

const clone = (value) => JSON.parse(JSON.stringify(value));

function loadLocal(key, fallback) {
  try {
    // Large catalogues must not be loaded from localStorage.
    if (key === 'sggs_books') {
      localStorage.removeItem('sggs_books');
      return clone(fallback);
    }

    const stored = localStorage.getItem(key);

    return stored ? JSON.parse(stored) : clone(fallback);
  } catch {
    return clone(fallback);
  }
}

function cacheBooksLocally(books) {
  try {
    // Keep the entire catalogue in Neon, not browser storage.
    if (!Array.isArray(books) || books.length > 5000) {
      localStorage.removeItem('sggs_books');
      return;
    }

    localStorage.setItem(
      'sggs_books',
      JSON.stringify(books)
    );
  } catch (error) {
    console.warn(
      'Book catalogue was not cached locally:',
      error
    );
  }
}

function safeSetLocal(key, value) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify(value)
    );
  } catch (error) {
    console.warn(
      `Unable to cache ${key} locally:`,
      error
    );
  }
}

function getLocalTheme() {
  try {
    return localStorage.getItem('sggs_theme') || 'light';
  } catch {
    return 'light';
  }
}

/*
 * =========================================================
 * INITIAL CONTENT
 * =========================================================
 *
 * Books are loaded separately from /api/books.
 * Other content continues to use /api/content.
 */

const initialContent = {
  books: loadLocal('sggs_books', defaultBooks),

  departments: loadLocal(
    'sggs_departments',
    departments
  ),

  resources: loadLocal(
    'sggs_resources',
    defaultResources
  ),

  // papers: loadLocal('sggs_papers', defaultPapers),

  announcements: loadLocal(
    'sggs_announcements',
    defaultAnnouncements
  ),

  publications: loadLocal(
    'sggs_publications',
    defaultPublications
  ),

  site: loadLocal(
    'sggs_site',
    defaultSite
  ),
};

/*
 * =========================================================
 * API HELPERS
 * =========================================================
 */

async function readApiResponse(response, fallbackMessage) {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error ||
        `${fallbackMessage} (${response.status})`
    );
  }

  return data;
}

/*
 * Load only the first page of books into shared React state.
 *
 * The public catalogue should fetch its own small pages
 * directly from /api/books.
 *
 * This prevents the entire catalogue from being loaded
 * into React context on every page.
 */

async function readBooksFromDatabase() {
  const query = new URLSearchParams({
    limit: String(BOOK_PAGE_SIZE),
    offset: '0',
  });

  const response = await fetch(
    `${BOOKS_API}?${query.toString()}`,
    {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    }
  );

  const data = await readApiResponse(
    response,
    'Unable to load books'
  );

  return Array.isArray(data.items)
    ? data.items
    : [];
}

/*
 * Save books in batches instead of sending one enormous
 * request to /api/content.
 */

async function postBookBatch(batch) {
  if (!batch.length) return;

  const response = await fetch(BOOKS_API, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      books: batch,
    }),
  });

  await readApiResponse(
    response,
    'Unable to save book records'
  );
}

async function saveBooksInBatches(allBooks) {
  if (!Array.isArray(allBooks)) {
    throw new Error('Books must be an array.');
  }

  const batches = [];

  for (
    let index = 0;
    index < allBooks.length;
    index += BOOK_BATCH_SIZE
  ) {
    batches.push(
      allBooks.slice(
        index,
        index + BOOK_BATCH_SIZE
      )
    );
  }

  // Run a limited number of requests concurrently.
  for (
    let index = 0;
    index < batches.length;
    index += BOOK_SAVE_CONCURRENCY
  ) {
    const group = batches.slice(
      index,
      index + BOOK_SAVE_CONCURRENCY
    );

    await Promise.all(
      group.map((batch) => postBookBatch(batch))
    );
  }
}

async function deleteBookFromDatabase(id) {
  const response = await fetch(BOOKS_API, {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id }),
  });

  await readApiResponse(
    response,
    'Unable to delete book'
  );
}

async function deleteAllBooksFromDatabase() {
  const response = await fetch(BOOKS_API, {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ all: true }),
  });

  await readApiResponse(
    response,
    'Unable to clear the book catalogue'
  );
}

/*
 * Save the changed book list without sending the whole
 * catalogue to /api/content.
 *
 * New and updated books are upserted.
 * Removed books from the currently loaded list are deleted.
 */

async function persistBooksChange(previousBooks, nextBooks) {
  if (!Array.isArray(nextBooks)) {
    throw new Error('Books must be an array.');
  }

  const previousIds = new Set(
    (Array.isArray(previousBooks) ? previousBooks : [])
      .map((book) => String(book.id))
  );

  const nextIds = new Set(
    nextBooks.map((book) => String(book.id))
  );

  const removedIds = [...previousIds].filter(
    (id) => !nextIds.has(id)
  );

  // Remove deleted records first.
  for (const id of removedIds) {
    await deleteBookFromDatabase(id);
  }

  // Upsert the records supplied by the caller.
  await saveBooksInBatches(nextBooks);

  // Only cache small catalogues locally.
  cacheBooksLocally(nextBooks);
}

/*
 * =========================================================
 * LIBRARY PROVIDER
 * =========================================================
 */

export function LibraryProvider({ children }) {
  const [books, setBooks] = useState(
    initialContent.books
  );

  const [departmentsData, setDepartmentsData] = useState(
    initialContent.departments
  );

  const [resources, setResources] = useState(
    initialContent.resources
  );

  // const [papers, setPapers] = useState(
  //   initialContent.papers
  // );

  const [announcements, setAnnouncements] = useState(
    initialContent.announcements
  );

  const [publications, setPublications] = useState(
    initialContent.publications
  );

  const [site, setSite] = useState(
    initialContent.site
  );

  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  const [contentReady, setContentReady] = useState(false);
  const [contentSaving, setContentSaving] = useState(false);

  const [theme, setTheme] = useState(getLocalTheme);

  const [toast, setToast] = useState('');

  /*
   * =========================================================
   * AUTH SESSION
   * =========================================================
   */

  useEffect(() => {
    let active = true;

    async function loadSession() {
      try {
        const response = await fetch(
          '/api/auth/session',
          {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
          }
        );

        if (!response.ok) {
          if (active) setUser(null);
          return;
        }

        const data = await response.json();

        if (active) {
          setUser(data.user || null);
        }
      } catch {
        if (active) {
          setUser(null);
        }
      } finally {
        if (active) {
          setAuthReady(true);
        }
      }
    }

    loadSession();

    return () => {
      active = false;
    };
  }, []);

  /*
   * =========================================================
   * LOAD CONTENT FROM NEON
   * =========================================================
   *
   * Books use /api/books.
   * Other content uses /api/content.
   *
   * Do not automatically POST initial state to the database.
   */

  useEffect(() => {
    let active = true;

    async function loadContentFromServer() {
      try {
        /*
         * Fetch non-book content and the first book page
         * independently.
         */
        const [contentResult, booksResult] =
          await Promise.allSettled([
            fetch(CONTENT_API, {
              method: 'GET',
              credentials: 'include',
              cache: 'no-store',
            }),

            readBooksFromDatabase(),
          ]);

        if (!active) return;

        /*
         * Apply non-book content.
         */

        if (contentResult.status === 'fulfilled') {
          const response = contentResult.value;

          const data = await readApiResponse(
            response,
            'Unable to load library content'
          );

          if (!active) return;

          /*
           * Intentionally do not read data.books.
           * The book catalogue is managed separately.
           */

          if (Array.isArray(data.departments)) {
            setDepartmentsData(data.departments);

            safeSetLocal(
              'sggs_departments',
              data.departments
            );
          }

          if (Array.isArray(data.resources)) {
            setResources(data.resources);

            safeSetLocal(
              'sggs_resources',
              data.resources
            );
          }

          // if (Array.isArray(data.papers)) {
          //   setPapers(data.papers);
          //   safeSetLocal('sggs_papers', data.papers);
          // }

          if (Array.isArray(data.announcements)) {
            setAnnouncements(data.announcements);

            safeSetLocal(
              'sggs_announcements',
              data.announcements
            );
          }

          if (Array.isArray(data.publications)) {
            setPublications(data.publications);

            safeSetLocal(
              'sggs_publications',
              data.publications
            );
          }

          if (
            data.site &&
            typeof data.site === 'object' &&
            !Array.isArray(data.site)
          ) {
            setSite(data.site);

            safeSetLocal(
              'sggs_site',
              data.site
            );
          }
        } else {
          console.error(
            'Failed to load library content:',
            contentResult.reason
          );
        }

        /*
         * Apply books from the database.
         */

        if (booksResult.status === 'fulfilled') {
          const databaseBooks = booksResult.value;

          setBooks(databaseBooks);
          cacheBooksLocally(databaseBooks);
        } else {
          console.error(
            'Failed to load books:',
            booksResult.reason
          );

          /*
           * Do not replace the current state with an empty
           * array when the database request fails.
           */
        }
      } catch (error) {
        console.error(
          'Failed to load library content:',
          error
        );
      } finally {
        if (active) {
          setContentReady(true);
        }
      }
    }

    loadContentFromServer();

    return () => {
      active = false;
    };
  }, []);

  /*
   * =========================================================
   * THEME
   * =========================================================
   */

  useEffect(() => {
    document.documentElement.dataset.theme = theme;

    try {
      localStorage.setItem(
        'sggs_theme',
        theme
      );
    } catch (error) {
      console.warn(
        'Unable to save theme preference:',
        error
      );
    }
  }, [theme]);

  /*
   * =========================================================
   * TOAST
   * =========================================================
   */

  useEffect(() => {
    if (!toast) return undefined;

    const timer = setTimeout(() => {
      setToast('');
    }, 2800);

    return () => clearTimeout(timer);
  }, [toast]);

  /*
   * =========================================================
   * SAVE ALL CONTENT
   * =========================================================
   *
   * Existing admin components can continue to call:
   *
   * await saveContent()
   *
   * Book changes are sent to /api/books.
   * Non-book changes are sent to /api/content.
   *
   * This prevents large book arrays from being sent to
   * /api/content and avoids Vercel request-body limits.
   */

  const saveContent = async (overrides = {}) => {
    setContentSaving(true);

    try {
      const hasBookOverride = Object.prototype
        .hasOwnProperty
        .call(overrides, 'books');

      /*
       * Save books separately only when the caller
       * explicitly supplies a books array.
       */
      if (hasBookOverride) {
        await persistBooksChange(
          books,
          overrides.books
        );

        setBooks(overrides.books);
      }

      /*
       * Build a payload without books.
       */

      const content = {
        departments:
          overrides.departments !== undefined
            ? overrides.departments
            : departmentsData,

        resources:
          overrides.resources !== undefined
            ? overrides.resources
            : resources,

        // papers:
        //   overrides.papers !== undefined
        //     ? overrides.papers
        //     : papers,

        announcements:
          overrides.announcements !== undefined
            ? overrides.announcements
            : announcements,

        publications:
          overrides.publications !== undefined
            ? overrides.publications
            : publications,

        site:
          overrides.site !== undefined
            ? overrides.site
            : site,
      };

      const response = await fetch(
        CONTENT_API,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(content),
        }
      );

      const data = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
            `Save failed with status ${response.status}`
        );
      }

      /*
       * Cache only non-book content locally.
       */

      safeSetLocal(
        'sggs_departments',
        content.departments
      );

      safeSetLocal(
        'sggs_resources',
        content.resources
      );

      // safeSetLocal('sggs_papers', content.papers);

      safeSetLocal(
        'sggs_announcements',
        content.announcements
      );

      safeSetLocal(
        'sggs_publications',
        content.publications
      );

      safeSetLocal(
        'sggs_site',
        content.site
      );

      setToast('Changes saved successfully');

      return data.data || content;
    } catch (error) {
      console.error(
        'Failed to save library content:',
        error
      );

      setToast(
        error.message || 'Unable to save changes'
      );

      throw error;
    } finally {
      setContentSaving(false);
    }
  };

  /*
   * =========================================================
   * UPLOAD MEDIA
   * =========================================================
   *
   * Usage:
   * const result = await uploadMedia(file);
   * result.url contains the uploaded media URL.
   */

  const uploadMedia = async (file) => {
    if (!file) {
      throw new Error('No file selected');
    }

    const formData = new FormData();

    formData.append('file', file);

    const response = await fetch(
      '/api/upload',
      {
        method: 'POST',
        credentials: 'include',
        body: formData,
      }
    );

    const data = await response
      .json()
      .catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.error ||
          `Upload failed with status ${response.status}`
      );
    }

    if (!data.url) {
      throw new Error(
        'Upload succeeded but no media URL was returned'
      );
    }

    setToast('Media uploaded successfully');

    return data;
  };

  /*
   * =========================================================
   * LOGIN
   * =========================================================
   */

  const login = async (email, password) => {
    const response = await fetch(
      '/api/auth/login',
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
        }),
      }
    );

    const data = await response
      .json()
      .catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.error ||
          'Invalid administrator credentials'
      );
    }

    setUser(data.user || null);

    return data.user;
  };

  /*
   * =========================================================
   * LOGOUT
   * =========================================================
   */

  const logout = async () => {
    try {
      await fetch(
        '/api/auth/logout',
        {
          method: 'POST',
          credentials: 'include',
        }
      );
    } catch {
      // Ignore logout network errors.
    }

    setUser(null);
  };

  /*
   * =========================================================
   * UPDATE E-RESOURCES ONLY
   * =========================================================
   *
   * This changes only E-Resources.
   * Other library content and the book catalogue remain
   * unchanged.
   */

  const resetResources = async () => {
    const nextResources = clone(defaultResources);

    setResources(nextResources);

    await saveContent({
      resources: nextResources,
    });

    setToast(
      'E-Resources updated successfully'
    );
  };

  /*
   * =========================================================
   * RESET DEMO CONTENT
   * =========================================================
   *
   * This is a destructive reset:
   * it clears the book table and restores default books,
   * then restores the other default content.
   */

  const resetDemo = async () => {
    const nextBooks = clone(defaultBooks);
    const nextDepartments = clone(departments);
    const nextResources = clone(defaultResources);

    // const nextPapers = clone(defaultPapers);

    const nextAnnouncements = clone(
      defaultAnnouncements
    );

    const nextPublications = clone(
      defaultPublications
    );

    const nextSite = clone(defaultSite);

    setBooks(nextBooks);
    setDepartmentsData(nextDepartments);
    setResources(nextResources);

    // setPapers(nextPapers);

    setAnnouncements(nextAnnouncements);
    setPublications(nextPublications);
    setSite(nextSite);

    try {
      /*
       * Reset the catalogue intentionally.
       */
      await deleteAllBooksFromDatabase();

      await saveBooksInBatches(nextBooks);

      cacheBooksLocally(nextBooks);

      /*
       * Save all remaining content without a books field.
       */
      await saveContent({
        departments: nextDepartments,
        resources: nextResources,

        // papers: nextPapers,

        announcements: nextAnnouncements,
        publications: nextPublications,
        site: nextSite,
      });

      setToast('Demo content restored');
    } catch (error) {
      console.error(
        'Failed to reset demo content:',
        error
      );

      setToast(
        error.message || 'Unable to reset demo content'
      );

      throw error;
    }
  };

  /*
   * =========================================================
   * CONTEXT VALUE
   * =========================================================
   *
   * Keep the existing public context properties so the
   * current pages can continue using useLibrary().
   */

  const value = useMemo(
    () => ({
      books,
      setBooks,

      departments: departmentsData,
      setDepartments: setDepartmentsData,

      resources,
      setResources,

      // papers,
      // setPapers,

      announcements,
      setAnnouncements,

      publications,
      setPublications,

      site,
      setSite,

      user,
      authReady,

      contentReady,
      contentSaving,

      login,
      logout,

      saveContent,
      uploadMedia,

      theme,
      setTheme,

      toast,
      setToast,

      resetDemo,
      resetResources,

      years,
      semesters,
    }),
    [
      books,
      departmentsData,
      resources,
      // papers,
      announcements,
      publications,
      site,
      user,
      authReady,
      contentReady,
      contentSaving,
      theme,
      toast,
    ]
  );

  return (
    <Ctx.Provider value={value}>
      {children}

      {toast && (
        <div className="toast">
          ✓ {toast}
        </div>
      )}
    </Ctx.Provider>
  );
}

/*
 * =========================================================
 * USE LIBRARY
 * =========================================================
 */

export const useLibrary = () => useContext(Ctx);