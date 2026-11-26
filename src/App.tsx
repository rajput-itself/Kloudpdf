import { useState, useEffect, lazy, Suspense } from 'react';
import { Header } from './components/Header/Header';
import { Footer } from './components/Footer/Footer';
import { HomePage } from './pages/Home/HomePage';
import { Modal } from './components/common/Modal/Modal';
import { TOOLS } from './config/tools';
import { ToolId } from './types';
import { Loader2 } from 'lucide-react';

const ToolWorkspace = lazy(() =>
  import('./pages/tools/ToolWorkspace').then((module) => ({
    default: module.ToolWorkspace,
  }))
);

const PDFEditorWorkspace = lazy(() =>
  import('./components/Editor/PDFEditorWorkspace').then((module) => ({
    default: module.PDFEditorWorkspace,
  }))
);

const OCRWorkspace = lazy(() =>
  import('./components/OCR/OCRWorkspace').then((module) => ({
    default: module.OCRWorkspace,
  }))
);

const RedactWorkspace = lazy(() =>
  import('./components/Redaction/RedactWorkspace').then((module) => ({
    default: module.RedactWorkspace,
  }))
);

const CompressWorkspace = lazy(() =>
  import('./components/Compress/CompressWorkspace').then((module) => ({
    default: module.CompressWorkspace,
  }))
);

const BatchWorkspace = lazy(() =>
  import('./components/Batch/BatchWorkspace').then((module) => ({
    default: module.BatchWorkspace,
  }))
);

const resolveRoute = (hash: string): { toolId: ToolId | null; isInvalid: boolean } => {
  const rawHash = hash.replace(/^#\/?/, '').trim();
  if (!rawHash || rawHash === 'tools' || rawHash === 'about' || rawHash === 'contact') {
    return { toolId: null, isInvalid: false };
  }
  if (rawHash === 'edit-pdf' || rawHash === 'edit') return { toolId: 'edit-pdf', isInvalid: false };
  if (rawHash === 'ocr-pdf' || rawHash === 'ocr') return { toolId: 'ocr-pdf', isInvalid: false };
  if (rawHash === 'redact-pdf' || rawHash === 'redact') return { toolId: 'redact-pdf', isInvalid: false };
  if (rawHash === 'compress-pdf' || rawHash === 'compress') return { toolId: 'compress-pdf', isInvalid: false };
  if (rawHash === 'batch-pdf' || rawHash === 'batch') return { toolId: 'batch-pdf', isInvalid: false };
  const exact = TOOLS.find((t) => t.id === rawHash);
  if (exact) return { toolId: exact.id, isInvalid: false };
  return { toolId: null, isInvalid: true };
};

export default function App() {
  const initialRoute = resolveRoute(window.location.hash);
  const [currentToolId, setCurrentToolId] = useState<ToolId | null>(initialRoute.toolId);
  const [isInvalidRoute, setIsInvalidRoute] = useState<boolean>(initialRoute.isInvalid);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      return localStorage.getItem('kloudpdf_theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  const [swUpdateReg, setSwUpdateReg] = useState<ServiceWorkerRegistration | null>(null);

  const [editorInitialFile, setEditorInitialFile] = useState<File | null>(null);
  const [modalType, setModalType] = useState<'about' | 'contact' | 'privacy' | 'terms' | 'faq' | null>(null);

  // Sync theme attribute on documentElement
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('kloudpdf_theme', theme);
    } catch {
      // Ignore storage failures
    }
  }, [theme]);

  // Listen for Service Worker update notifications
  useEffect(() => {
    const onSwUpdate = (e: Event) => {
      const ce = e as CustomEvent<ServiceWorkerRegistration>;
      setSwUpdateReg(ce.detail);
    };
    window.addEventListener('kloudpdf-sw-update', onSwUpdate);
    return () => window.removeEventListener('kloudpdf-sw-update', onSwUpdate);
  }, []);

  // Synchronize hash with state for browser history and direct bookmarks
  useEffect(() => {
    const handleHashChange = () => {
      const next = resolveRoute(window.location.hash);
      setCurrentToolId(next.toolId);
      setIsInvalidRoute(next.isInvalid);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const selectedTool = currentToolId ? TOOLS.find((t) => t.id === currentToolId) : null;

  // Dynamic SEO title, description & canonical tags per active route
  useEffect(() => {
    const baseTitle = 'KloudPDF — PDF tools. Made simple.';
    const defaultDesc =
      'KloudPDF — Privacy-first, 100% browser-based PDF tools: edit, compress, merge, split, OCR, redact, convert, and batch process documents locally on your device.';

    if (isInvalidRoute) {
      document.title = 'Page Not Found — KloudPDF';
    } else if (selectedTool) {
      document.title = `${selectedTool.name} — KloudPDF`;
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) metaDesc.setAttribute('content', `${selectedTool.description} Runs 100% locally in your browser.`);
      const canonical = document.querySelector('link[rel="canonical"]');
      if (canonical) canonical.setAttribute('href', `https://kloudpdf.com/#/${selectedTool.id}`);
    } else {
      document.title = baseTitle;
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) metaDesc.setAttribute('content', defaultDesc);
      const canonical = document.querySelector('link[rel="canonical"]');
      if (canonical) canonical.setAttribute('href', 'https://kloudpdf.com/');
    }
  }, [selectedTool, isInvalidRoute]);

  const handleSelectTool = (toolId: ToolId) => {
    window.location.hash = `#/${toolId}`;
    setCurrentToolId(toolId);
    setIsInvalidRoute(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNavigateHome = () => {
    window.location.hash = '';
    setCurrentToolId(null);
    setIsInvalidRoute(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="app-layout">
      <a href="#main-content" className="skip-to-content-link">
        Skip to main content
      </a>

      {swUpdateReg && (
        <div
          role="status"
          aria-live="polite"
          style={{
            backgroundColor: '#1a73e8',
            color: '#ffffff',
            padding: '0.5rem 1rem',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
          }}
        >
          <span>A new version of KloudPDF is ready.</span>
          <button
            type="button"
            onClick={() => {
              swUpdateReg.waiting?.postMessage({ type: 'SKIP_WAITING' });
              window.location.reload();
            }}
            style={{
              backgroundColor: '#ffffff',
              color: '#1a73e8',
              padding: '0.2rem 0.65rem',
              borderRadius: '4px',
              fontWeight: 600,
            }}
          >
            Update Now
          </button>
        </div>
      )}

      {selectedTool?.id !== 'edit-pdf' &&
        selectedTool?.id !== 'ocr-pdf' &&
        selectedTool?.id !== 'redact-pdf' &&
        selectedTool?.id !== 'compress-pdf' &&
        selectedTool?.id !== 'batch-pdf' && (
        <Header
          onNavigateHome={handleNavigateHome}
          onOpenAbout={() => setModalType('about')}
          onOpenContact={() => setModalType('contact')}
          onOpenFaq={() => setModalType('faq')}
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        />
      )}

      <main id="main-content" className="main-content">
        {isInvalidRoute ? (
          <div style={{ textAlign: 'center', padding: '5rem 1.5rem', maxWidth: '540px', margin: '0 auto' }}>
            <h1 style={{ fontSize: '2.25rem', fontWeight: 700, marginBottom: '0.75rem' }}>404 — Tool Not Found</h1>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>
              The requested PDF tool route does not exist. Explore all available privacy-first tools from the KloudPDF home directory.
            </p>
            <button type="button" className="btn btn-primary btn-md" onClick={handleNavigateHome}>
              Return to All PDF Tools
            </button>
          </div>
        ) : selectedTool ? (
          selectedTool.id === 'edit-pdf' ? (
            <Suspense
              fallback={
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '80vh',
                    gap: '1rem',
                    color: 'var(--color-primary)',
                  }}
                >
                  <Loader2 size={36} className="btn-spinner" />
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                    Loading PDF Editor...
                  </p>
                </div>
              }
            >
              <PDFEditorWorkspace
                tool={selectedTool}
                onBack={handleNavigateHome}
                initialFile={editorInitialFile || undefined}
              />
            </Suspense>
          ) : selectedTool.id === 'ocr-pdf' ? (
            <Suspense
              fallback={
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '80vh',
                    gap: '1rem',
                    color: 'var(--color-primary)',
                  }}
                >
                  <Loader2 size={36} className="btn-spinner" />
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                    Loading OCR PDF Workspace...
                  </p>
                </div>
              }
            >
              <OCRWorkspace
                tool={selectedTool}
                onBack={handleNavigateHome}
                onOpenInEditor={(file) => {
                  setEditorInitialFile(file);
                  handleSelectTool('edit-pdf');
                }}
              />
            </Suspense>
          ) : selectedTool.id === 'redact-pdf' ? (
            <Suspense
              fallback={
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '80vh',
                    gap: '1rem',
                    color: 'var(--color-primary)',
                  }}
                >
                  <Loader2 size={36} className="btn-spinner" />
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                    Loading Redaction Workspace...
                  </p>
                </div>
              }
            >
              <RedactWorkspace
                tool={selectedTool}
                onBack={handleNavigateHome}
              />
            </Suspense>
          ) : selectedTool.id === 'compress-pdf' ? (
            <Suspense
              fallback={
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '80vh',
                    gap: '1rem',
                    color: 'var(--color-primary)',
                  }}
                >
                  <Loader2 size={36} className="btn-spinner" />
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                    Loading PDF Compressor...
                  </p>
                </div>
              }
            >
              <CompressWorkspace
                tool={selectedTool}
                onBack={handleNavigateHome}
              />
            </Suspense>
          ) : selectedTool.id === 'batch-pdf' ? (
            <Suspense
              fallback={
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '80vh',
                    gap: '1rem',
                    color: 'var(--color-primary)',
                  }}
                >
                  <Loader2 size={36} className="btn-spinner" />
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                    Loading Batch PDF Workspace...
                  </p>
                </div>
              }
            >
              <BatchWorkspace
                tool={selectedTool}
                onBack={handleNavigateHome}
              />
            </Suspense>
          ) : (
            <Suspense
              fallback={
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '50vh',
                    gap: '1rem',
                    color: 'var(--color-primary)',
                  }}
                >
                  <Loader2 size={36} className="btn-spinner" />
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                    Loading {selectedTool.name}...
                  </p>
                </div>
              }
            >
              <ToolWorkspace tool={selectedTool} onBack={handleNavigateHome} />
            </Suspense>
          )
        ) : (
          <HomePage onSelectTool={handleSelectTool} />
        )}
      </main>

      {selectedTool?.id !== 'edit-pdf' &&
        selectedTool?.id !== 'ocr-pdf' &&
        selectedTool?.id !== 'redact-pdf' &&
        selectedTool?.id !== 'compress-pdf' &&
        selectedTool?.id !== 'batch-pdf' && (
        <Footer
          onNavigateHome={handleNavigateHome}
          onOpenAbout={() => setModalType('about')}
          onOpenContact={() => setModalType('contact')}
          onOpenPrivacy={() => setModalType('privacy')}
          onOpenTerms={() => setModalType('terms')}
          onOpenFaq={() => setModalType('faq')}
        />
      )}

      {/* About Modal */}
      <Modal
        isOpen={modalType === 'about'}
        onClose={() => setModalType(null)}
        title="About KloudPDF"
      >
        <h4>PDF tools. Made simple.</h4>
        <p>
          KloudPDF is an engineering-first, browser-based PDF utility platform. We believe
          everyday document tasks—merging, splitting, rotating, converting, and protecting files—should
          be fast, private, and effortless.
        </p>
        <h4>Core Guarantees</h4>
        <ul>
          <li><strong>100% Client-Side:</strong> All operations execute directly in your browser.</li>
          <li><strong>Zero Server Uploads:</strong> Your documents never leave your physical device.</li>
          <li><strong>No Registration:</strong> No accounts, no subscriptions, and no paywalls.</li>
          <li><strong>Clean Architecture:</strong> Powered by modern Web standards and open-source engines.</li>
        </ul>
      </Modal>

      {/* Contact Modal */}
      <Modal
        isOpen={modalType === 'contact'}
        onClose={() => setModalType(null)}
        title="Contact & Feedback"
      >
        <p>
          Have questions, bug reports, or suggestions for new client-side PDF capabilities? We’d love to hear from you.
        </p>
        <p>
          <strong>Email:</strong> support@kloudpdf.internal<br />
          <strong>GitHub:</strong> github.com/KloudPDF
        </p>
        <p className="text-secondary" style={{ fontSize: '0.85rem' }}>
          Note: Since KloudPDF is entirely client-side, we never have access to your uploaded files or documents.
        </p>
      </Modal>

      {/* Privacy Policy Modal */}
      <Modal
        isOpen={modalType === 'privacy'}
        onClose={() => setModalType(null)}
        title="Privacy Policy"
      >
        <h4>Privacy by Design</h4>
        <p>
          KloudPDF is architected from the ground up to respect user privacy:
        </p>
        <ul>
          <li><strong>No Document Storage or Uploads:</strong> Files processed through KloudPDF stay strictly in temporary browser memory and are never uploaded to external servers.</li>
          <li><strong>Non-Sensitive Local Preferences:</strong> Non-sensitive UI theme choices and custom batch preset settings (passwords stripped) are saved in browser localStorage.</li>
          <li><strong>External Static Assets:</strong> Optional OCR language packs (Tesseract traineddata) and PDF CMap/font assets may be fetched from public CDNs when requested; no document bytes are ever sent.</li>
          <li><strong>Immediate Disposal:</strong> Once you complete an operation or close the tab, temporary Blob URLs and memory buffers are released.</li>
        </ul>
      </Modal>

      {/* Terms of Service Modal */}
      <Modal
        isOpen={modalType === 'terms'}
        onClose={() => setModalType(null)}
        title="Terms of Service"
      >
        <h4>Usage Terms</h4>
        <p>
          KloudPDF is provided as a client-side document utility for personal and professional use.
          Because all processing occurs directly in your browser, you retain complete ownership and responsibility
          over all files and content manipulated with the tool.
        </p>
        <p>
          The service is provided &quot;as is&quot;, without warranty of any kind, express or implied. Please review legal and privacy notices independently for regulated compliance workflows.
        </p>
      </Modal>

      {/* FAQ & Technical Capabilities Modal */}
      <Modal
        isOpen={modalType === 'faq'}
        onClose={() => setModalType(null)}
        title="Frequently Asked Questions"
      >
        <h4>Does KloudPDF upload my files to a server?</h4>
        <p>
          No. All PDF editing, compression, OCR, conversion, encryption, and batch tasks run inside your local browser memory.
        </p>
        <h4>Which features work offline?</h4>
        <p>
          Once loaded, KloudPDF installs as a Progressive Web App (PWA). Core PDF tools work completely offline. Note that OCR language traineddata packs (e.g. Hindi or Spanish) and optional CMap character maps require an initial internet download the first time they are requested.
        </p>
        <h4>Why is PDF/A conversion deferred?</h4>
        <p>
          Strict ISO 19005 PDF/A archiving requires full ICC profile validation and complete font subsetting beyond pure JavaScript browser engines without large multi-megabyte WebAssembly validators.
        </p>
      </Modal>
    </div>
  );
}
