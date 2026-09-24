import React, { useState } from 'react';
import {
  Link,
  NavLink,
  useLocation,
} from 'react-router-dom';

import {
  Menu,
  X,
  Moon,
  Sun,
  Search,
  ChevronDown,
} from 'lucide-react';

import { useLibrary } from '../../context/LibraryContext';

const navItems = [
  ['/catalogue', 'Catalogue'],
  ['/e-resources', 'E-Resources'],
  ['/question-papers', 'Question Papers'],
  ['/departments', 'Departments'],
  ['/publications', 'Publications'],
  ['/facilities', 'Facilities'],
  ['/contact', 'Contact'],
];

export default function Header() {
  const [open, setOpen] = useState(false);
  const [homeDropdownOpen, setHomeDropdownOpen] =
    useState(false);

  const { theme, setTheme } = useLibrary();

  const location = useLocation();

  /*
   * Determine which item should be displayed
   * in the Home/About dropdown.
   */
  const isHomePage = location.pathname === '/';
  const isAboutPage = location.pathname === '/about';

  const currentHomeLabel = isAboutPage
    ? 'About'
    : 'Home';

  const currentHomeActive =
    isHomePage || isAboutPage;

  const closeNavigation = () => {
    setOpen(false);
    setHomeDropdownOpen(false);
  };

  return (
    <>
      {/* =========================================================
          TOP STRIP
      ========================================================= */}

      <div className="top-strip">
        <div className="container top-strip-inner">

          <a
            href="https://sggs.ac.in"
            target="_blank"
            rel="noopener noreferrer"
          >
            Shri Guru Gobind Singhji Institute of Engineering &amp;
            Technology, Nanded
          </a>

          <span>
            Central Library
          </span>

        </div>
      </div>

      {/* =========================================================
          HEADER
      ========================================================= */}

      <header className="site-header">

        <div className="container nav-shell">

          {/* BRAND */}

          <Link
            to="/"
            className="brand"
            onClick={closeNavigation}
          >
            <img
              src="/images/image.webp"
              alt="Shri Guru Gobind Singhji Institute of Engineering and Technology, Nanded"
            />
          </Link>


          {/* =====================================================
              MOBILE MENU BUTTON
          ===================================================== */}

          <button
            className="mobile-toggle"
            onClick={() => {
              setOpen(value => !value);
              setHomeDropdownOpen(false);
            }}
            aria-label="Toggle navigation"
            aria-expanded={open}
          >
            {open ? <X /> : <Menu />}
          </button>


          {/* =====================================================
              NAVIGATION
          ===================================================== */}

          <nav
            className={
              open
                ? 'main-nav open'
                : 'main-nav'
            }
          >

            {/* =================================================
                HOME / ABOUT DROPDOWN
            ================================================= */}

            <div
              className="home-nav"
              style={{
                position: 'relative',
              }}
            >

              <NavLink
                to={isAboutPage ? '/about' : '/'}
                end
                onClick={event => {
                  event.preventDefault();

                  setHomeDropdownOpen(
                    value => !value
                  );
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0px',
                  padding: '10px 11px',
                  border: '0',
                  background:
                    currentHomeActive
                      ? '#edf4fa'
                      : 'transparent',
                  borderRadius:
                    currentHomeActive
                      ? '8px'
                      : '0',
                  color:
                    currentHomeActive
                      ? 'var(--primary)'
                      : theme === 'dark'
                        ? '#bdc9d5'
                        : '#4d596b',
                  fontWeight: 600,
                  fontSize: '13px',
                  lineHeight: '1.2',
                  textDecoration: 'none',
                  cursor: 'pointer',
                }}
              >

                {/* DYNAMIC TEXT */}

                {currentHomeLabel}

                <ChevronDown
                  size={15}
                  style={{
                    marginLeft: '4px',
                    flexShrink: 0,
                    transform:
                      homeDropdownOpen
                        ? 'rotate(180deg)'
                        : 'rotate(0deg)',
                    transition:
                      'transform 0.2s ease',
                  }}
                />

              </NavLink>


              {/* =================================================
                  DROPDOWN
              ================================================= */}

              {homeDropdownOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    left: '0',
                    minWidth: '150px',
                    padding: '6px',
                    background:
                      theme === 'dark'
                        ? '#122333'
                        : '#ffffff',
                    border:
                      theme === 'dark'
                        ? '1px solid #29445a'
                        : '1px solid #e5e7eb',
                    borderRadius: '10px',
                    boxShadow:
                      '0 12px 30px rgba(0, 0, 0, 0.12)',
                    zIndex: 1000,
                  }}
                >

                  {/* HOME */}

                  <Link
                    to="/"
                    onClick={closeNavigation}
                    style={{
                      display: 'block',
                      padding: '9px 11px',
                      borderRadius: '7px',
                      color:
                        theme === 'dark'
                          ? '#bdc9d5'
                          : '#4d596b',
                      fontSize: '13px',
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    Home
                  </Link>


                  {/* ABOUT */}

                  <Link
                    to="/about"
                    onClick={closeNavigation}
                    style={{
                      display: 'block',
                      padding: '9px 11px',
                      borderRadius: '7px',
                      color:
                        theme === 'dark'
                          ? '#bdc9d5'
                          : '#4d596b',
                      fontSize: '13px',
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    About
                  </Link>

                </div>
              )}

            </div>


            {/* =================================================
                MAIN NAVIGATION
            ================================================= */}

            {navItems.map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                end
                onClick={closeNavigation}
              >
                {label}
              </NavLink>
            ))}


            {/* =================================================
                NAV ACTIONS
            ================================================= */}

            <div className="nav-actions">

              {/* SEARCH */}

              <Link
                className="icon-btn"
                title="Search catalogue"
                to="/catalogue"
                onClick={closeNavigation}
                aria-label="Search catalogue"
              >
                <Search />
              </Link>


              {/* THEME */}

              <button
                className="icon-btn"
                onClick={() =>
                  setTheme(
                    theme === 'dark'
                      ? 'light'
                      : 'dark'
                  )
                }
                title="Toggle theme"
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? (
                  <Sun />
                ) : (
                  <Moon />
                )}
              </button>

            </div>

          </nav>

        </div>

      </header>
    </>
  );
}