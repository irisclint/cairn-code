import { useEffect, type JSX } from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { Home } from './pages/Home';
import { About } from './pages/About';
import { DownloadPage } from './pages/DownloadPage';
import { Learn } from './pages/Learn';
import { Privacy } from './pages/Privacy';
import { Terms } from './pages/Terms';

const TITLES: Record<string, string> = {
  '/': 'Causeway - a code editor that explains your errors',
  '/about': 'About Causeway - how and why it is built',
  '/download': 'Download Causeway for Windows, macOS and Linux',
  '/learn': 'Learn to code with Causeway',
  '/privacy': 'Privacy - Causeway',
  '/terms': 'Terms - Causeway'
};

/**
 * Restores scroll position on navigation.
 *
 * A client side router leaves the scroll offset where it was, so a visitor
 * moving from the bottom of the home page to About would land halfway down it.
 * A hash still wins, so in-page links keep working.
 */
function ScrollManager(): null {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    document.title = TITLES[pathname] ?? 'Causeway';

    if (hash) {
      const target = document.querySelector(hash);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname, hash]);

  return null;
}

export function App(): JSX.Element {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <ScrollManager />
      <Header />
      <main id="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/download" element={<DownloadPage />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          {/* Anything unknown goes home rather than showing a dead end. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
    </>
  );
}
