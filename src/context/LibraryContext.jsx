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

const clone = (value) => JSON.parse(JSON.stringify(value));

function loadLocal(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : clone(fallback);
  } catch {
    return clone(fallback);
  }
}

// Large catalogues belong in the database, not browser localStorage.
// Keep only small catalogues in the browser cache to avoid quota failures.
function cacheBooksLocally(books) {
  try {
    if (!Array.isArray(books) || books.length > 5000) {
      localStorage.removeItem('sggs_books');
      return;
    }
    localStorage.setItem('sggs_books', JSON.stringify(books));
  } catch (error) {
    console.warn('Book catalogue was not cached locally:', error);
  }
}

function safeSetLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Unable to cache ${key} locally:`, error);
  }
}

const initialContent = {
  books: loadLocal('sggs_books', defaultBooks),
  departments: loadLocal('sggs_departments', departments),
  resources: loadLocal('sggs_resources', defaultResources),
  // papers: loadLocal('sggs_papers', defaultPapers),
  announcements: loadLocal(
    'sggs_announcements',
    defaultAnnouncements
  ),
  publications: loadLocal(
    'sggs_publications',
    defaultPublications
  ),
  site: loadLocal('sggs_site', defaultSite),
};

export function LibraryProvider({ children }) {
  const [books, setBooks] = useState(initialContent.books);

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

  const [theme, setTheme] = useState(
    () => localStorage.getItem('sggs_theme') || 'light'
  );

  const [toast, setToast] = useState('');

  /*
   * =========================================================
   * AUTH SESSION
   * =========================================================
   */

  useEffect(() => {
    let active = true;

    fetch('/api/auth/session', {
      credentials: 'include',
    })
      .then(async (response) => {
        if (!response.ok) {
          return { authenticated: false };
        }

        return response.json();
      })
      .then((data) => {
        if (!active) return;

        setUser(data.user || null);
      })
      .catch(() => {
        if (active) {
          setUser(null);
        }
      })
      .finally(() => {
        if (active) {
          setAuthReady(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  /*
   * =========================================================
   * LOAD CONTENT FROM NEON
   * =========================================================
   *
   * Neon is the production source of truth.
   *
   * We do NOT automatically POST the initial React state.
   * This prevents default/empty local data from overwriting
   * the database.
   */

  useEffect(() => {
    let active = true;

    async function loadContentFromServer() {
      try {
        const response = await fetch('/api/content', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error(
            `Content API returned ${response.status}`
          );
        }

        const data = await response.json();

        if (!active) return;

        if (Array.isArray(data.books)) {
          setBooks(data.books);

          cacheBooksLocally(data.books);
        }

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

        //   localStorage.setItem(
        //     'sggs_papers',
        //     JSON.stringify(data.papers)
        //   );
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

        setContentReady(true);
      } catch (error) {
        console.error(
          'Failed to load library content:',
          error
        );

        /*
         * LocalStorage/default data remains available as fallback.
         */

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

    localStorage.setItem(
      'sggs_theme',
      theme
    );
  }, [theme]);

  /*
   * =========================================================
   * TOAST
   * =========================================================
   */

  useEffect(() => {
    if (!toast) return undefined;

    const timer = setTimeout(
      () => setToast(''),
      2800
    );

    return () => clearTimeout(timer);
  }, [toast]);

  /*
   * =========================================================
   * SAVE ALL CONTENT TO NEON
   * =========================================================
   *
   * Admin pages can call:
   *
   * await saveContent()
   *
   * This sends the current application state to /api/content.
   */

  const saveContent = async (
    overrides = {}
  ) => {
    setContentSaving(true);

    try {
      const content = {
        books:
          overrides.books !== undefined
            ? overrides.books
            : books,

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
        '/api/content',
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
       * Keep localStorage as a local cache only.
       */

      cacheBooksLocally(content.books);

      safeSetLocal(
        'sggs_departments',
        content.departments
      );

      safeSetLocal(
        'sggs_resources',
        content.resources
      );

      // localStorage.setItem(
      //   'sggs_papers',
      //   JSON.stringify(content.papers)
      // );

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
        error.message ||
        'Unable to save changes'
      );

      throw error;
    } finally {
      setContentSaving(false);
    }
  };

  /*
   * =========================================================
   * UPLOAD MEDIA TO VERCEL BLOB
   * =========================================================
   *
   * Usage:
   *
   * const result = await uploadMedia(file);
   *
   * result.url = permanent Blob URL
   */

  const uploadMedia = async (file) => {
    if (!file) {
      throw new Error('No file selected');
    }

    const formData = new FormData();

    formData.append(
      'file',
      file
    );

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

  const login = async (
    email,
    password
  ) => {
    const response = await fetch(
      '/api/auth/login',
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type':
            'application/json',
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

    setUser(data.user);

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
   * This updates only the E-Resources collection.
   * Other library content remains unchanged.
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
   * This resets React state and saves the defaults to Neon.
   */

  const resetDemo = async () => {
    const nextBooks = clone(defaultBooks);
    const nextDepartments = clone(departments);
    const nextResources = clone(defaultResources);
    // const nextPapers = clone(defaultPapers);
    const nextAnnouncements =
      clone(defaultAnnouncements);
    const nextPublications =
      clone(defaultPublications);
    const nextSite = clone(defaultSite);

    setBooks(nextBooks);
    setDepartmentsData(nextDepartments);
    setResources(nextResources);
    // setPapers(nextPapers);
    setAnnouncements(nextAnnouncements);
    setPublications(nextPublications);
    setSite(nextSite);

    await saveContent({
      books: nextBooks,
      departments: nextDepartments,
      resources: nextResources,
      // papers: nextPapers,
      announcements: nextAnnouncements,
      publications: nextPublications,
      site: nextSite,
    });

    setToast(
      'Demo content restored'
    );
  };

  /*
   * =========================================================
   * CONTEXT VALUE
   * =========================================================
   */

  const value = useMemo(
    () => ({
      books,
      setBooks,

      departments:
        departmentsData,
      setDepartments:
        setDepartmentsData,

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

export const useLibrary = () =>
  useContext(Ctx);