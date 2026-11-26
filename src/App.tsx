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

const resolveToolId = (hash: string): ToolId | null => {
  const rawHash = hash.replace(/^#\/?/, '');
  if (rawHash === 'edit-pdf' || rawHash === 'edit') return 'edit-pdf';
  if (rawHash === 'ocr-pdf' || rawHash === 'ocr') return 'ocr-pdf';
  if (rawHash === 'redact-pdf' || rawHash === 'redact') return 'redact-pdf';
  if (rawHash === 'compress-pdf' || rawHash === 'compress') return 'compress-pdf';
  if (rawHash === 'batch-pdf' || rawHash === 'batch') return 'batch-pdf';
  return TOOLS.some((t) => t.id === rawHash) ? (rawHash as ToolId) : null;
};

export default function App() {
  const [currentToolId, setCurrentToolId] = useState<ToolId | null>(() => {
    return resolveToolId(window.location.hash);
  });

  const [editorInitialFile, setEditorInitialFile] = useState<File | null>(null);
  const [modalType, setModalType] = useState<'about' | 'contact' | 'privacy' | 'terms' | null>(null);

  // Synchronize hash with state for browser history and direct bookmarks
  useEffect(() => {
    const handleHashChange = () => {
      setCurrentToolId(resolveToolId(window.location.hash));
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const selectedTool = currentToolId ? TOOLS.find((t) => t.id === currentToolId) : null;

  const handleSelectTool = (toolId: ToolId) => {
    window.location.hash = `#/${toolId}`;
    setCurrentToolId(toolId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNavigateHome = () => {
    window.location.hash = '';
    setCurrentToolId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="app-layout">
      {selectedTool?.id !== 'edit-pdf' &&
        selectedTool?.id !== 'ocr-pdf' &&
        selectedTool?.id !== 'redact-pdf' &&
        selectedTool?.id !== 'compress-pdf' &&
        selectedTool?.id !== 'batch-pdf' && (
        <Header
          onNavigateHome={handleNavigateHome}
          onOpenAbout={() => setModalType('about')}
          onOpenContact={() => setModalType('contact')}
        />
      )}

      <main className="main-content">
        {selectedTool ? (
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

      {selectedTool?.id !== 'edit-pdf' && selectedTool?.id !== 'ocr-pdf' && selectedTool?.id !== 'redact-pdf' && (
        <Footer
          onNavigateHome={handleNavigateHome}
          onOpenAbout={() => setModalType('about')}
          onOpenContact={() => setModalType('contact')}
          onOpenPrivacy={() => setModalType('privacy')}
          onOpenTerms={() => setModalType('terms')}
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
          <li><strong>No File Storage:</strong> Files processed through KloudPDF are stored in temporary browser memory only.</li>
          <li><strong>No Server Transmission:</strong> Files are never transmitted over the internet to any backend or remote servers.</li>
          <li><strong>No Tracking Cookies:</strong> We do not track personal identifying information.</li>
          <li><strong>Immediate Disposal:</strong> Once you complete an operation or close the tab, all memory references are garbage-collected.</li>
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
          The service is provided "as is", without warranty of any kind, express or implied.
        </p>
      </Modal>
    </div>
  );
}
