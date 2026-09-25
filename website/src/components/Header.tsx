import { useEffect, useState, type JSX } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { GitHub, Menu, Cross, Download } from './Icons';
import { PRODUCT, REPOSITORY_URL } from '../data/content';

const LINKS = [
  { to: '/', label: 'Home' },
  { to: '/learn', label: 'Learn' },
  { to: '/about', label: 'About' },
  { to: '/download', label: 'Download' }
];

export function Header(): JSX.Element {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const location = useLocation();

  /* The header only takes a background once the page leaves the top. */
  useEffect(() => {
    const onScroll = (): void => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* A navigation always closes the mobile menu, including a back gesture. */
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <header className="site-header" data-scrolled={scrolled}>
      {/*
        A graded blur under the bar rather than one that stops at an edge.
        Each band blurs a little more than the one above it and is masked to
        its own slice, so the content sliding underneath softens instead of
        crossing a visible line. Purely decorative, so it is hidden from
        assistive technology and takes no pointer events.
      */}
      <div className="site-header__veil" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>

      <div className="container site-header__inner">
        <Link to="/" className="brand" aria-label={`${PRODUCT} home`}>
          <img src="/cairn-logo.svg" alt="" className="brand__mark" width={30} height={30} />
          <span className="brand__name">
            cairn<span className="brand__suffix">-code</span>
          </span>
        </Link>

        <nav className="site-nav" data-open={open} aria-label="Main">
          {LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} className="site-nav__link" end={link.to === '/'}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="site-header__actions">
          <a
            className="button button--ghost"
            href={REPOSITORY_URL}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={`${PRODUCT} on GitHub`}
          >
            <GitHub size={18} />
          </a>

          <Link to="/download" className="button button--primary">
            <Download size={17} />
            Download
          </Link>

          <button
            type="button"
            className="nav-toggle"
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <Cross size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
    </header>
  );
}
