import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { ToolDefinition } from '../../types';
import {
  EditorObject,
  EditorToolMode,
  PageDimension,
} from '../../types/editor';
import { EditorTopBar } from './EditorTopBar';
import { EditorSidebar } from './EditorSidebar';
import { EditorToolbar } from './EditorToolbar';
import { EditorContextBar } from './EditorContextBar';
import { EditorCanvas } from './EditorCanvas';
import { SignatureModal } from './SignatureModal';
import { FileUpload } from '../FileUpload/FileUpload';
import { loadPdfDocument, renderPageToDataUrl } from '../../services/pdf/render';
import { exportEditedPdf } from '../../services/pdf/editorExport';
import { downloadBlob } from '../../utils/file';
import { AlertCircle } from 'lucide-react';
import './PDFEditorWorkspace.css';

interface PDFEditorWorkspaceProps {
  tool: ToolDefinition;
  onBack: () => void;
  initialFile?: File;
}

const MAX_HISTORY_LENGTH = 30;

export const PDFEditorWorkspace: React.FC<PDFEditorWorkspaceProps> = ({
  tool,
  onBack,
  initialFile,
}) => {
  // Document state
  const [file, setFile] = useState<File | null>(initialFile || null);
  const [originalBuffer, setOriginalBuffer] = useState<ArrayBuffer | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageDimensions, setPageDimensions] = useState<PageDimension[]>([]);
  const [pageThumbnails, setPageThumbnails] = useState<Record<number, string>>({});
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(() => {
    return typeof window !== 'undefined' && window.innerWidth < 768 ? 0.6 : 1.0;
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return typeof window !== 'undefined' ? window.innerWidth < 900 : false;
  });

  // Editing state
  const [activeMode, setActiveMode] = useState<EditorToolMode>('select');
  const [objects, setObjects] = useState<EditorObject[]>([]);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);

  // Undo / Redo History
  const [past, setPast] = useState<EditorObject[][]>([]);
  const [future, setFuture] = useState<EditorObject[][]>([]);

  // Modals & UI feedback
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgressMsg, setExportProgressMsg] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // File loading lock
  const isLoadingRef = useRef(false);

  // Load and parse PDF document
  const loadDocument = useCallback(async (selectedFile: File) => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    setErrorMessage(null);

    try {
      const buffer = await selectedFile.arrayBuffer();
      // Keep an isolated copy for originalBuffer
      setOriginalBuffer(buffer.slice(0));

      const loadedPdf = await loadPdfDocument(buffer.slice(0));
      setPdfDoc(loadedPdf);

      const numPages = loadedPdf.numPages;
      const dims: PageDimension[] = [];

      for (let i = 1; i <= numPages; i++) {
        const page = await loadedPdf.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        dims.push({
          pageNumber: i,
          width: viewport.width,
          height: viewport.height,
          rotation: (page.rotate || 0) % 360,
        });
      }

      setPageDimensions(dims);
      setFile(selectedFile);
      setObjects([]);
      setPast([]);
      setFuture([]);
      setSelectedObjectId(null);

      // Auto-fit initial zoom on mobile screens
      if (typeof window !== 'undefined' && window.innerWidth < 768 && dims[0]) {
        const availWidth = window.innerWidth - 32;
        const initialFitZoom = Math.max(0.4, Math.min(1.0, availWidth / dims[0].width));
        setZoom(Number(initialFitZoom.toFixed(2)));
      }

      // Render thumbnails asynchronously
      for (let i = 1; i <= Math.min(numPages, 15); i++) {
        try {
          const thumbUrl = await renderPageToDataUrl(loadedPdf, i, 0.25);
          setPageThumbnails((prev) => ({ ...prev, [i]: thumbUrl }));
        } catch (thumbErr) {
          console.warn(`Thumbnail generation failed for page ${i}:`, thumbErr);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load PDF document';
      setErrorMessage(`Could not open document: ${msg}`);
      setPdfDoc(null);
    } finally {
      isLoadingRef.current = false;
    }
  }, []);

  // Handle initialFile prop if provided
  useEffect(() => {
    if (initialFile && !pdfDoc) {
      loadDocument(initialFile);
    }
  }, [initialFile, pdfDoc, loadDocument]);

  // Clean up PDF resources on unmount
  useEffect(() => {
    return () => {
      if (pdfDoc) {
        pdfDoc.destroy();
      }
    };
  }, [pdfDoc]);

  // Unsaved changes warning
  const hasEdits = objects.length > 0;
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasEdits) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasEdits]);

  // History Helper: Commit changes to Undo stack
  const commitToHistory = useCallback((newObjects: EditorObject[]) => {
    setPast((prevPast) => {
      const updated = [...prevPast, objects];
      if (updated.length > MAX_HISTORY_LENGTH) {
        return updated.slice(updated.length - MAX_HISTORY_LENGTH);
      }
      return updated;
    });
    setFuture([]);
    setObjects(newObjects);
  }, [objects]);

  // Undo Action
  const handleUndo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1]!;
    const newPast = past.slice(0, past.length - 1);

    setFuture((prevFuture) => [objects, ...prevFuture]);
    setPast(newPast);
    setObjects(previous);

    // If selected object is no longer present, clear selection
    if (selectedObjectId && !previous.some((o) => o.id === selectedObjectId)) {
      setSelectedObjectId(null);
    }
  }, [past, objects, selectedObjectId]);

  // Redo Action
  const handleRedo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0]!;
    const newFuture = future.slice(1);

    setPast((prevPast) => [...prevPast, objects]);
    setFuture(newFuture);
    setObjects(next);
  }, [future, objects]);

  // Add Object
  const handleAddObject = useCallback((newObj: EditorObject) => {
    commitToHistory([...objects, newObj]);
    setSelectedObjectId(newObj.id);
    setActiveMode('select');
  }, [commitToHistory, objects]);

  // Update Object
  const handleUpdateObject = useCallback((updated: EditorObject) => {
    const updatedList = objects.map((o) => (o.id === updated.id ? updated : o));
    setObjects(updatedList);
  }, [objects]);

  // Delete Object
  const handleDeleteObject = useCallback((id: string) => {
    const filtered = objects.filter((o) => o.id !== id);
    commitToHistory(filtered);
    if (selectedObjectId === id) {
      setSelectedObjectId(null);
    }
  }, [commitToHistory, objects, selectedObjectId]);

  // Duplicate Object
  const handleDuplicateObject = useCallback((id: string) => {
    const target = objects.find((o) => o.id === id);
    if (!target) return;

    const cloned: EditorObject = {
      ...target,
      id: `${target.type}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      x: target.x + 16,
      y: target.y + 16,
    };

    commitToHistory([...objects, cloned]);
    setSelectedObjectId(cloned.id);
  }, [commitToHistory, objects]);

  // Insert Image
  const handleInsertImage = useCallback((imageFile: File) => {
    const reader = new FileReader();
    reader.onload = (loadEvt) => {
      const dataUrl = loadEvt.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const aspect = img.width / img.height;
        const targetW = 200;
        const targetH = targetW / aspect;

        const newId = `image_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const newImgObj: EditorObject = {
          id: newId,
          pageNumber: currentPage,
          type: 'image',
          x: 50,
          y: 80,
          width: targetW,
          height: targetH,
          dataUrl,
          mimeType: imageFile.type === 'image/png' ? 'image/png' : 'image/jpeg',
          aspectRatio: aspect,
          rotation: 0,
          opacity: 1,
        };

        handleAddObject(newImgObj);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(imageFile);
  }, [currentPage, handleAddObject]);

  // Insert Signature
  const handleInsertSignature = useCallback((dataUrl: string, width: number, height: number) => {
    const newId = `sig_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newSigObj: EditorObject = {
      id: newId,
      pageNumber: currentPage,
      type: 'signature',
      x: 60,
      y: 100,
      width,
      height,
      dataUrl,
      strokeColor: '#1a73e8',
      opacity: 1,
    };
    handleAddObject(newSigObj);
  }, [currentPage, handleAddObject]);

  // Reset all edits
  const handleResetEdits = () => {
    if (window.confirm('Are you sure you want to discard all inserted elements on this document?')) {
      commitToHistory([]);
      setSelectedObjectId(null);
    }
  };

  // Fit to page width
  const handleFitWidth = () => {
    if (pageDimensions.length === 0) return;
    const viewportWidth = window.innerWidth - (isSidebarCollapsed ? 40 : 200) - 80;
    const firstPageWidth = pageDimensions[0]!.width;
    const computedZoom = Math.max(0.4, Math.min(2.0, viewportWidth / firstPageWidth));
    setZoom(Number(computedZoom.toFixed(2)));
  };

  // Keyboard Shortcuts (Undo, Redo, Delete, Escape, Tools)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in textarea or input
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      // Undo: Ctrl+Z or Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Redo: Ctrl+Shift+Z, Cmd+Shift+Z, or Ctrl+Y
      if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && e.shiftKey) ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y')
      ) {
        e.preventDefault();
        handleRedo();
        return;
      }

      if (isInput) return;

      // Delete selected
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedObjectId) {
          e.preventDefault();
          handleDeleteObject(selectedObjectId);
        }
        return;
      }

      // Deselect
      if (e.key === 'Escape') {
        setSelectedObjectId(null);
        setActiveMode('select');
        return;
      }

      // Tool shortcuts (V: select, T: text, H: highlight, D: draw, N: note)
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key.toLowerCase() === 'v') setActiveMode('select');
        else if (e.key.toLowerCase() === 't') setActiveMode('text');
        else if (e.key.toLowerCase() === 'h') setActiveMode('highlight');
        else if (e.key.toLowerCase() === 'd') setActiveMode('drawing');
        else if (e.key.toLowerCase() === 'n') setActiveMode('note');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, handleDeleteObject, selectedObjectId]);

  // PDF Export
  const handleDownload = async () => {
    if (!file && !originalBuffer) return;
    setIsExporting(true);
    setErrorMessage(null);

    try {
      // Re-read fresh buffer from File object if available so the buffer is guaranteed fresh and never detached
      let bufferToExport: ArrayBuffer;
      if (file) {
        bufferToExport = await file.arrayBuffer();
      } else if (originalBuffer && originalBuffer.byteLength > 0) {
        bufferToExport = originalBuffer.slice(0);
      } else {
        throw new Error('Original document buffer is detached or unavailable. Please reload the document.');
      }

      const exportedBlob = await exportEditedPdf(
        bufferToExport,
        objects,
        (_curr, _total, msg) => setExportProgressMsg(msg)
      );

      const baseName = file?.name ? file.name.replace(/\.pdf$/i, '') : 'document';
      const outputFilename = `${baseName}-edited.pdf`;

      downloadBlob(exportedBlob, outputFilename);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown export error';
      setErrorMessage(`Export failed: ${msg}`);
    } finally {
      setIsExporting(false);
      setExportProgressMsg('');
    }
  };

  // Scroll to selected page from sidebar thumbnail
  const handleSelectPage = (pageNum: number) => {
    setCurrentPage(pageNum);
    const pageEl = document.getElementById(`editor-page-${pageNum}`);
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Group edits count per page for sidebar badges
  const pageEditsCount = objects.reduce<Record<number, number>>((acc, obj) => {
    acc[obj.pageNumber] = (acc[obj.pageNumber] || 0) + 1;
    return acc;
  }, {});

  const selectedObject = objects.find((o) => o.id === selectedObjectId) || null;

  // 1. Initial State: No document loaded yet
  if (!file || !pdfDoc) {
    return (
      <div className="editor-upload-screen">
        <div className="container editor-upload-container">
          <button
            type="button"
            className="editor-back-link"
            onClick={onBack}
            aria-label="Back to tools"
          >
            ← Back to PDF Tools
          </button>

          <div className="editor-upload-header">
            <h1 className="editor-upload-title">{tool.name}</h1>
            <p className="editor-upload-description">{tool.description}</p>
          </div>

          {errorMessage && (
            <div className="editor-error-banner" role="alert">
              <AlertCircle size={18} />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="editor-dropzone-wrapper">
            <FileUpload
              tool={tool}
              onFilesSelected={(selected) => {
                if (selected.length > 0) loadDocument(selected[0]!);
              }}
            />
          </div>

          <div className="editor-privacy-note">
            <span className="privacy-badge-pill">100% Private</span>
            <span>All editing occurs locally in your browser. No files are uploaded to any server.</span>
          </div>
        </div>
      </div>
    );
  }

  // 2. Main Visual PDF Editor Workspace
  return (
    <div className="pdf-editor-workspace-layout">
      {/* Top Navigation & Action Bar */}
      <EditorTopBar
        documentName={file.name}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        zoom={zoom}
        onZoomChange={(newZoom) => setZoom(newZoom)}
        onFitWidth={handleFitWidth}
        onResetZoom={() => setZoom(1.0)}
        onDownload={handleDownload}
        onBack={onBack}
        onResetEdits={handleResetEdits}
        isExporting={isExporting}
        hasEdits={hasEdits}
      />

      {/* Editor Body */}
      <div className="pdf-editor-body">
        {/* Left Sidebar: Thumbnails & Page Navigation */}
        <EditorSidebar
          pageCount={pageDimensions.length}
          currentPage={currentPage}
          onSelectPage={handleSelectPage}
          pageThumbnails={pageThumbnails}
          pageEditsCount={pageEditsCount}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        />

        {/* Center Canvas Area */}
        <div className="editor-center-stage">
          {/* Floating Tool Selector */}
          <EditorToolbar
            activeMode={activeMode}
            onSelectMode={(mode) => {
              setActiveMode(mode);
              if (mode !== 'select') setSelectedObjectId(null);
            }}
            onInsertImage={handleInsertImage}
            onOpenSignatureModal={() => setSignatureModalOpen(true)}
          />

          {/* Context Property Inspector for Selected Object */}
          <EditorContextBar
            selectedObject={selectedObject}
            onUpdateObject={handleUpdateObject}
            onDeleteObject={handleDeleteObject}
            onDuplicateObject={handleDuplicateObject}
          />

          {/* Exporting Progress Toast */}
          {isExporting && (
            <div className="editor-export-toast">
              <div className="toast-spinner" />
              <span>{exportProgressMsg || 'Exporting document...'}</span>
            </div>
          )}

          {/* Error Message Toast */}
          {errorMessage && (
            <div className="editor-toast-error">
              <AlertCircle size={16} />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Core Page Canvas Stack */}
          <EditorCanvas
            pdfDoc={pdfDoc}
            pageDimensions={pageDimensions}
            zoom={zoom}
            activeMode={activeMode}
            objects={objects}
            selectedObjectId={selectedObjectId}
            onSelectObject={(id) => setSelectedObjectId(id)}
            onAddObject={handleAddObject}
            onUpdateObject={handleUpdateObject}
            currentPage={currentPage}
            onPageVisible={(pageNum) => setCurrentPage(pageNum)}
          />
        </div>
      </div>

      {/* Signature Modal */}
      <SignatureModal
        isOpen={signatureModalOpen}
        onClose={() => setSignatureModalOpen(false)}
        onInsert={handleInsertSignature}
      />
    </div>
  );
};
