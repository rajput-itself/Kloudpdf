import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { ToolDefinition } from '../../types';
import {
  EditorObject,
  EditorToolMode,
  PageDimension,
  ExistingTextItem,
  ExistingImageItem,
  ContentEditState,
  StandardFontFamily,
} from '../../types/editor';
import { EditorTopBar } from './EditorTopBar';
import { EditorSidebar } from './EditorSidebar';
import { EditorToolbar } from './EditorToolbar';
import { EditorContextBar } from './EditorContextBar';
import { EditorCanvas } from './EditorCanvas';
import { SignatureModal } from './SignatureModal';
import { FindReplaceModal } from './FindReplaceModal';
import { BeforeAfterModal } from './BeforeAfterModal';
import { OcrCorrectionModal } from './OcrCorrectionModal';
import { FormFillModal } from './FormFillModal';
import { MetadataModal } from './MetadataModal';
import { ValidationModal } from './ValidationModal';
import { FileUpload } from '../FileUpload/FileUpload';
import { loadPdfDocument, renderPageToDataUrl } from '../../services/pdf/render';
import { exportEditedPdf } from '../../services/pdf/editorExport';
import {
  extractPageExistingContent,
  findTextOccurrences,
  applyFindAndReplace,
} from '../../services/pdf/contentEditorEngine';
import { inspectPdfForm } from '../../services/pdf/forms';
import { flattenPdfDocument } from '../../services/pdf/flatten';
import { detectScannedPage, OcrLineItem } from '../../services/pdf/ocr';
import { downloadBlob } from '../../utils/file';
import { AlertCircle, ScanText } from 'lucide-react';
import './PDFEditorWorkspace.css';

interface PDFEditorWorkspaceProps {
  tool: ToolDefinition;
  onBack: () => void;
  initialFile?: File;
}

const MAX_HISTORY_LENGTH = 30;

interface HistorySnapshot {
  objects: EditorObject[];
  contentEdits: ContentEditState;
}

export const PDFEditorWorkspace: React.FC<PDFEditorWorkspaceProps> = ({
  tool,
  onBack,
  initialFile,
}) => {
  // Document state
  const [file, setFile] = useState<File | null>(initialFile || null);
  const [originalBuffer, setOriginalBuffer] = useState<ArrayBuffer | null>(null);
  const [originalPdfBytes, setOriginalPdfBytes] = useState<Uint8Array | null>(null);
  const originalBytesRef = useRef<Uint8Array | null>(null);
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

  // Phase 4: Form, Metadata, Validation, Toast state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isMetadataModalOpen, setIsMetadataModalOpen] = useState(false);
  const [isValidationModalOpen, setIsValidationModalOpen] = useState(false);
  const [hasAcroForm, setHasAcroForm] = useState(false);
  const [actionToast, setActionToast] = useState<string | null>(null);

  // Editing state (Phase 1)
  const [activeMode, setActiveMode] = useState<EditorToolMode>('select');
  const [objects, setObjects] = useState<EditorObject[]>([]);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);

  // Editing state (Phase 2: True Content Editing)
  const [existingTexts, setExistingTexts] = useState<Record<number, ExistingTextItem[]>>({});
  const [existingImages, setExistingImages] = useState<Record<number, ExistingImageItem[]>>({});
  const [contentEdits, setContentEdits] = useState<ContentEditState>({
    modifiedTexts: {},
    modifiedImages: {},
  });
  const [selectedExistingTextId, setSelectedExistingTextId] = useState<string | null>(null);
  const [selectedExistingImageId, setSelectedExistingImageId] = useState<string | null>(null);

  // Find & Replace state
  const [isFindReplaceOpen, setIsFindReplaceOpen] = useState(false);
  const [findMatches, setFindMatches] = useState<ExistingTextItem[]>([]);
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0);

  // Before & After state
  const [isBeforeAfterOpen, setIsBeforeAfterOpen] = useState(false);

  // OCR Scanned Text Modal state (Phase 3)
  const [isOcrModalOpen, setIsOcrModalOpen] = useState(false);
  const [isScannedPageDetected, setIsScannedPageDetected] = useState(false);

  // Undo / Redo History (tracks both overlay objects and genuine content edits)
  const [past, setPast] = useState<HistorySnapshot[]>([]);
  const [future, setFuture] = useState<HistorySnapshot[]>([]);

  // Modals & UI feedback
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgressMsg, setExportProgressMsg] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // File loading lock
  const isLoadingRef = useRef(false);

  // Load and parse PDF document from in-memory byte buffer
  const loadDocumentFromBytes = useCallback(async (bytesData: Uint8Array, filename?: string) => {
    isLoadingRef.current = true;
    setErrorMessage(null);

    try {
      const cleanBytes = new Uint8Array(bytesData.slice());
      setOriginalPdfBytes(cleanBytes);
      originalBytesRef.current = cleanBytes;
      setOriginalBuffer(cleanBytes.buffer.slice(0));

      const loadedPdf = await loadPdfDocument(cleanBytes.slice());
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
      if (filename) {
        setFile(new File([cleanBytes.slice()], filename, { type: 'application/pdf' }));
      }
      setObjects([]);
      setContentEdits({ modifiedTexts: {}, modifiedImages: {} });
      setPast([]);
      setFuture([]);
      setSelectedObjectId(null);
      setSelectedExistingTextId(null);
      setSelectedExistingImageId(null);

      // Inspect AcroForms presence
      try {
        const formCheck = await inspectPdfForm(cleanBytes.slice());
        setHasAcroForm(formCheck.fields.length > 0);
      } catch {
        setHasAcroForm(false);
      }

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

      // Extract existing content for each page (Phase 2)
      const textsMap: Record<number, ExistingTextItem[]> = {};
      const imagesMap: Record<number, ExistingImageItem[]> = {};

      for (let i = 1; i <= numPages; i++) {
        const dim = dims[i - 1]!;
        try {
          const content = await extractPageExistingContent(
            loadedPdf,
            i,
            dim.height,
            dim.width,
            dim.rotation
          );
          textsMap[i] = content.texts;
          imagesMap[i] = content.images;
        } catch (extErr) {
          console.warn(`Content extraction failed for page ${i}:`, extErr);
          textsMap[i] = [];
          imagesMap[i] = [];
        }
      }

      setExistingTexts(textsMap);
      setExistingImages(imagesMap);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load PDF document';
      setErrorMessage(`Could not open document: ${msg}`);
      setPdfDoc(null);
    } finally {
      isLoadingRef.current = false;
    }
  }, []);

  // Load and parse PDF document from selected File
  const loadDocument = useCallback(async (selectedFile: File) => {
    if (isLoadingRef.current) return;
    try {
      const buffer = await selectedFile.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      await loadDocumentFromBytes(bytes, selectedFile.name);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to read file';
      setErrorMessage(`Could not read file: ${msg}`);
    }
  }, [loadDocumentFromBytes]);

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
  const hasContentEdits =
    Object.keys(contentEdits.modifiedTexts).length > 0 ||
    Object.keys(contentEdits.modifiedImages).length > 0;
  const hasEdits = objects.length > 0 || hasContentEdits;

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
  const commitToHistory = useCallback(
    (newObjects: EditorObject[] = objects, newContentEdits: ContentEditState = contentEdits) => {
      setPast((prevPast) => {
        const updated = [...prevPast, { objects, contentEdits }];
        if (updated.length > MAX_HISTORY_LENGTH) {
          return updated.slice(updated.length - MAX_HISTORY_LENGTH);
        }
        return updated;
      });
      setFuture([]);
      setObjects(newObjects);
      setContentEdits(newContentEdits);
    },
    [objects, contentEdits]
  );

  // Undo Action
  const handleUndo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1]!;
    const newPast = past.slice(0, past.length - 1);

    setFuture((prevFuture) => [{ objects, contentEdits }, ...prevFuture]);
    setPast(newPast);
    setObjects(previous.objects);
    setContentEdits(previous.contentEdits);

    // If selected object is no longer present, clear selection
    if (selectedObjectId && !previous.objects.some((o) => o.id === selectedObjectId)) {
      setSelectedObjectId(null);
    }
  }, [past, objects, contentEdits, selectedObjectId]);

  // Redo Action
  const handleRedo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0]!;
    const newFuture = future.slice(1);

    setPast((prevPast) => [...prevPast, { objects, contentEdits }]);
    setFuture(newFuture);
    setObjects(next.objects);
    setContentEdits(next.contentEdits);
  }, [future, objects, contentEdits]);

  // Phase 2: Update existing text
  const handleUpdateExistingText = useCallback(
    (updated: ExistingTextItem) => {
      const nextEdits: ContentEditState = {
        ...contentEdits,
        modifiedTexts: {
          ...contentEdits.modifiedTexts,
          [updated.id]: updated,
        },
      };
      commitToHistory(objects, nextEdits);
    },
    [commitToHistory, contentEdits, objects]
  );

  // Phase 2: Delete existing text
  const handleDeleteExistingText = useCallback(
    (id: string) => {
      let item: ExistingTextItem | undefined = contentEdits.modifiedTexts[id];
      if (!item) {
        for (const list of Object.values(existingTexts)) {
          const found = list.find((t) => t.id === id);
          if (found) {
            item = found;
            break;
          }
        }
      }
      if (!item) return;

      const deletedItem: ExistingTextItem = {
        ...item,
        isDeleted: true,
        isModified: true,
      };

      const nextEdits: ContentEditState = {
        ...contentEdits,
        modifiedTexts: {
          ...contentEdits.modifiedTexts,
          [id]: deletedItem,
        },
      };
      commitToHistory(objects, nextEdits);
      setSelectedExistingTextId(null);
    },
    [commitToHistory, contentEdits, existingTexts, objects]
  );

  // Phase 2: Replace existing image
  const handleReplaceExistingImage = useCallback(
    (id: string, newImageFile: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        let img: ExistingImageItem | undefined = contentEdits.modifiedImages[id];
        if (!img) {
          for (const list of Object.values(existingImages)) {
            const found = list.find((i) => i.id === id);
            if (found) {
              img = found;
              break;
            }
          }
        }
        if (!img) return;

        const updatedImg: ExistingImageItem = {
          ...img,
          isModified: true,
          isDeleted: false,
          replacementDataUrl: dataUrl,
          replacementMimeType: newImageFile.type as 'image/jpeg' | 'image/png',
        };

        const nextEdits: ContentEditState = {
          ...contentEdits,
          modifiedImages: {
            ...contentEdits.modifiedImages,
            [id]: updatedImg,
          },
        };
        commitToHistory(objects, nextEdits);
      };
      reader.readAsDataURL(newImageFile);
    },
    [commitToHistory, contentEdits, existingImages, objects]
  );

  // Phase 2: Delete existing image
  const handleDeleteExistingImage = useCallback(
    (id: string) => {
      let img: ExistingImageItem | undefined = contentEdits.modifiedImages[id];
      if (!img) {
        for (const list of Object.values(existingImages)) {
          const found = list.find((i) => i.id === id);
          if (found) {
            img = found;
            break;
          }
        }
      }
      if (!img) return;

      const deletedImg: ExistingImageItem = {
        ...img,
        isDeleted: true,
        isModified: true,
      };

      const nextEdits: ContentEditState = {
        ...contentEdits,
        modifiedImages: {
          ...contentEdits.modifiedImages,
          [id]: deletedImg,
        },
      };
      commitToHistory(objects, nextEdits);
      setSelectedExistingImageId(null);
    },
    [commitToHistory, contentEdits, existingImages, objects]
  );

  // Find & Replace
  const handleFind = useCallback(
    (query: string, caseSensitive: boolean): number => {
      const allTexts: ExistingTextItem[] = [];
      Object.values(existingTexts).forEach((list) => {
        list.forEach((t) => {
          const live = contentEdits.modifiedTexts[t.id] || t;
          allTexts.push(live);
        });
      });

      const matches = findTextOccurrences(allTexts, query, caseSensitive);
      setFindMatches(matches);
      setCurrentMatchIdx(0);
      if (matches.length > 0 && matches[0]) {
        setSelectedExistingTextId(matches[0].id);
        setCurrentPage(matches[0].pageNumber);
      }
      return matches.length;
    },
    [contentEdits, existingTexts]
  );

  const handleNextMatch = () => {
    if (findMatches.length === 0) return;
    const nextIdx = (currentMatchIdx + 1) % findMatches.length;
    setCurrentMatchIdx(nextIdx);
    const match = findMatches[nextIdx]!;
    setSelectedExistingTextId(match.id);
    setCurrentPage(match.pageNumber);
  };

  const handlePrevMatch = () => {
    if (findMatches.length === 0) return;
    const prevIdx = (currentMatchIdx - 1 + findMatches.length) % findMatches.length;
    setCurrentMatchIdx(prevIdx);
    const match = findMatches[prevIdx]!;
    setSelectedExistingTextId(match.id);
    setCurrentPage(match.pageNumber);
  };

  const handleReplaceNext = (query: string, replacement: string, caseSensitive: boolean) => {
    if (findMatches.length === 0) return;
    const current = findMatches[currentMatchIdx];
    if (!current) return;

    const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? '' : 'i');
    const newText = current.text.replace(regex, replacement);

    const updatedItem: ExistingTextItem = {
      ...current,
      text: newText,
      isModified: true,
    };

    handleUpdateExistingText(updatedItem);
    handleFind(query, caseSensitive);
  };

  const handleReplaceAll = (query: string, replacement: string, caseSensitive: boolean): number => {
    const allTexts: ExistingTextItem[] = [];
    Object.values(existingTexts).forEach((list) => {
      list.forEach((t) => {
        const live = contentEdits.modifiedTexts[t.id] || t;
        allTexts.push(live);
      });
    });

    const { updatedTexts, replacedCount } = applyFindAndReplace(
      allTexts,
      query,
      replacement,
      caseSensitive,
      true
    );

    const updatedMap = { ...contentEdits.modifiedTexts };
    updatedTexts.forEach((t) => {
      if (t.isModified) {
        updatedMap[t.id] = t;
      }
    });

    const nextEdits: ContentEditState = {
      ...contentEdits,
      modifiedTexts: updatedMap,
    };

    commitToHistory(objects, nextEdits);
    setFindMatches([]);
    return replacedCount;
  };

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
    if (window.confirm('Are you sure you want to discard all additions and modifications on this document?')) {
      commitToHistory([], { modifiedTexts: {}, modifiedImages: {} });
      setSelectedObjectId(null);
      setSelectedExistingTextId(null);
      setSelectedExistingImageId(null);
    }
  };

  // Detect if current page is scanned (has low or no embedded text)
  useEffect(() => {
    let isCancelled = false;
    if (pdfDoc) {
      detectScannedPage(pdfDoc, currentPage).then((isScanned) => {
        if (!isCancelled) {
          setIsScannedPageDetected(isScanned);
        }
      });
    } else {
      setIsScannedPageDetected(false);
    }
    return () => {
      isCancelled = true;
    };
  }, [pdfDoc, currentPage]);

  // Apply OCR Text Correction (inpaint background patch + replacement text)
  const handleApplyOcrCorrection = useCallback(
    (params: {
      line: OcrLineItem;
      replacementText: string;
      fontFamily: StandardFontFamily;
      fontSize: number;
      color: string;
      bgColor: string;
    }) => {
      const coords = params.line.pdfCoords || {
        x: 50,
        y: 50,
        width: 150,
        height: 20,
      };

      const inpaintRect: EditorObject = {
        id: `ocr_patch_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        pageNumber: currentPage,
        type: 'rectangle',
        x: coords.x - 2,
        y: coords.y - 1,
        width: coords.width + 4,
        height: coords.height + 2,
        fillColor: params.bgColor || '#ffffff',
        strokeColor: params.bgColor || '#ffffff',
        strokeWidth: 0,
        opacity: 1,
      };

      const textBox: EditorObject = {
        id: `ocr_text_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        pageNumber: currentPage,
        type: 'text',
        x: coords.x,
        y: coords.y,
        width: Math.max(80, coords.width),
        height: Math.max(20, coords.height),
        text: params.replacementText,
        fontSize: params.fontSize,
        fontFamily: params.fontFamily,
        color: params.color,
        isBold: false,
        isItalic: false,
        lineHeight: 1.25,
        textAlign: 'left',
        opacity: 1,
      };

      commitToHistory([...objects, inpaintRect, textBox]);
      setSelectedObjectId(textBox.id);
      setActiveMode('select');
    },
    [commitToHistory, currentPage, objects]
  );

  // Convert all OCR lines on page to editable text objects
  const handleConvertAllLinesToObjects = useCallback(
    (
      lines: OcrLineItem[],
      options: { fontFamily: StandardFontFamily; color: string }
    ) => {
      const newItems: EditorObject[] = [...objects];
      lines.forEach((l, idx) => {
        if (!l.text.trim()) return;
        const coords = l.pdfCoords || {
          x: 50,
          y: 50 + idx * 24,
          width: 180,
          height: 18,
        };

        const patch: EditorObject = {
          id: `ocr_patch_all_${Date.now()}_${idx}`,
          pageNumber: currentPage,
          type: 'rectangle',
          x: coords.x - 2,
          y: coords.y - 1,
          width: coords.width + 4,
          height: coords.height + 2,
          fillColor: '#ffffff',
          strokeColor: '#ffffff',
          strokeWidth: 0,
          opacity: 1,
        };

        const txt: EditorObject = {
          id: `ocr_text_all_${Date.now()}_${idx}`,
          pageNumber: currentPage,
          type: 'text',
          x: coords.x,
          y: coords.y,
          width: Math.max(60, coords.width),
          height: Math.max(20, coords.height),
          text: l.text,
          fontSize: Math.max(10, Math.round(coords.height * 0.8)),
          fontFamily: options.fontFamily || 'Helvetica',
          color: options.color || '#000000',
          isBold: false,
          isItalic: false,
          lineHeight: 1.25,
          textAlign: 'left',
          opacity: 1,
        };

        newItems.push(patch, txt);
      });

      commitToHistory(newItems);
      setActiveMode('select');
    },
    [commitToHistory, currentPage, objects]
  );

  // Fit to page width
  const handleFitWidth = () => {
    if (pageDimensions.length === 0) return;
    const viewportWidth = window.innerWidth - (isSidebarCollapsed ? 40 : 200) - 80;
    const firstPageWidth = pageDimensions[0]!.width;
    const computedZoom = Math.max(0.4, Math.min(2.0, viewportWidth / firstPageWidth));
    setZoom(Number(computedZoom.toFixed(2)));
  };

  // Keyboard Shortcuts (Undo, Redo, Delete, Escape, Tools, Find)
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

      // Find: Ctrl+F or Cmd+F
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setIsFindReplaceOpen(true);
        return;
      }

      if (isInput) return;

      // Delete selected
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedObjectId) {
          e.preventDefault();
          handleDeleteObject(selectedObjectId);
        } else if (selectedExistingTextId) {
          e.preventDefault();
          handleDeleteExistingText(selectedExistingTextId);
        } else if (selectedExistingImageId) {
          e.preventDefault();
          handleDeleteExistingImage(selectedExistingImageId);
        }
        return;
      }

      // Deselect
      if (e.key === 'Escape') {
        setSelectedObjectId(null);
        setSelectedExistingTextId(null);
        setSelectedExistingImageId(null);
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
  }, [
    handleUndo,
    handleRedo,
    handleDeleteObject,
    handleDeleteExistingText,
    handleDeleteExistingImage,
    selectedObjectId,
    selectedExistingTextId,
    selectedExistingImageId,
  ]);

  // PDF Export
  const handleDownload = async () => {
    if (!file && !originalBuffer && !originalPdfBytes && !originalBytesRef.current) return;
    setIsExporting(true);
    setErrorMessage(null);

    try {
      // Prioritize in-memory clean byte clone first so we NEVER call file.arrayBuffer()
      // on a detached File object in Safari/WebKit
      let bytesToExport: Uint8Array;
      if (originalBytesRef.current && originalBytesRef.current.byteLength > 0) {
        bytesToExport = new Uint8Array(originalBytesRef.current.slice());
      } else if (originalPdfBytes && originalPdfBytes.byteLength > 0) {
        bytesToExport = new Uint8Array(originalPdfBytes.slice());
      } else if (originalBuffer && originalBuffer.byteLength > 0) {
        bytesToExport = new Uint8Array(originalBuffer.slice(0));
      } else if (file) {
        try {
          const freshBuf = await file.arrayBuffer();
          bytesToExport = new Uint8Array(freshBuf);
        } catch {
          throw new Error('Original document buffer is detached or unavailable. Please reload the document.');
        }
      } else {
        throw new Error('Original document buffer is detached or unavailable. Please reload the document.');
      }

      const exportedBlob = await exportEditedPdf(
        bytesToExport,
        objects,
        (_curr, _total, msg) => setExportProgressMsg(msg),
        contentEdits
      );

      const baseName = file?.name ? file.name.replace(/\.pdf$/i, '') : 'document';
      const outputFilename = `${baseName}-edited.pdf`;

      downloadBlob(exportedBlob, outputFilename);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown export error';
      console.error('Export failed:', err);
      setErrorMessage(`Export failed: ${msg}`);
    } finally {
      setIsExporting(false);
      setExportProgressMsg('');
    }
  };

  // Phase 4: Flatten PDF Forms
  const handleFlatten = async () => {
    let bytes: Uint8Array | null = null;
    if (originalBytesRef.current && originalBytesRef.current.byteLength > 0) {
      bytes = new Uint8Array(originalBytesRef.current.slice());
    } else if (originalPdfBytes && originalPdfBytes.byteLength > 0) {
      bytes = new Uint8Array(originalPdfBytes.slice());
    } else if (originalBuffer && originalBuffer.byteLength > 0) {
      bytes = new Uint8Array(originalBuffer.slice(0));
    }
    if (!bytes) {
      setErrorMessage('No active document available to flatten.');
      return;
    }

    try {
      setIsExporting(true);
      setExportProgressMsg('Flattening interactive form fields into static artwork...');
      const flatBlob = await flattenPdfDocument(bytes);
      const newBuf = await flatBlob.arrayBuffer();
      await loadDocumentFromBytes(new Uint8Array(newBuf), file?.name);
      setActionToast('Document forms successfully flattened into permanent artwork!');
      setTimeout(() => setActionToast(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Flattening failed';
      setErrorMessage(`Failed to flatten form: ${msg}`);
    } finally {
      setIsExporting(false);
      setExportProgressMsg('');
    }
  };

  // Phase 4: Save Filled AcroForm
  const handleSaveForm = async (newBuffer: ArrayBuffer, flattened: boolean) => {
    const newBytes = new Uint8Array(newBuffer);
    await loadDocumentFromBytes(newBytes, file?.name);
    setActionToast(flattened ? 'Form flattened into static artwork!' : 'Form values saved!');
    setTimeout(() => setActionToast(null), 4000);
  };

  // Phase 4: Save Modified / Sanitized Metadata
  const handleSaveMetadata = async (newBuffer: ArrayBuffer) => {
    const newBytes = new Uint8Array(newBuffer);
    await loadDocumentFromBytes(newBytes, file?.name);
    setActionToast('Document metadata updated!');
    setTimeout(() => setActionToast(null), 4000);
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

  // Add Phase 2 content edits count to page badges
  Object.values(contentEdits.modifiedTexts).forEach((t) => {
    pageEditsCount[t.pageNumber] = (pageEditsCount[t.pageNumber] || 0) + 1;
  });
  Object.values(contentEdits.modifiedImages).forEach((img) => {
    pageEditsCount[img.pageNumber] = (pageEditsCount[img.pageNumber] || 0) + 1;
  });

  const selectedObject = objects.find((o) => o.id === selectedObjectId) || null;

  const selectedExistingText = selectedExistingTextId
    ? contentEdits.modifiedTexts[selectedExistingTextId] ||
      (() => {
        for (const list of Object.values(existingTexts)) {
          const found = list.find((t) => t.id === selectedExistingTextId);
          if (found) return found;
        }
        return null;
      })()
    : null;

  const selectedExistingImage = selectedExistingImageId
    ? contentEdits.modifiedImages[selectedExistingImageId] ||
      (() => {
        for (const list of Object.values(existingImages)) {
          const found = list.find((i) => i.id === selectedExistingImageId);
          if (found) return found;
        }
        return null;
      })()
    : null;

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
        onOpenOcr={() => setIsOcrModalOpen(true)}
        isScannedDetected={isScannedPageDetected}
        onOpenFormFill={() => setIsFormModalOpen(true)}
        hasForm={hasAcroForm}
        onFlatten={handleFlatten}
        onOpenMetadata={() => setIsMetadataModalOpen(true)}
        onOpenValidation={() => setIsValidationModalOpen(true)}
      />

      {/* Action Success Toast */}
      {actionToast && (
        <div className="editor-toast-success">
          <span>{actionToast}</span>
        </div>
      )}

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
              if (mode !== 'select') {
                setSelectedObjectId(null);
              }
              if (mode !== 'edit-content') {
                setSelectedExistingTextId(null);
                setSelectedExistingImageId(null);
              }
            }}
            onInsertImage={handleInsertImage}
            onOpenSignatureModal={() => setSignatureModalOpen(true)}
            onOpenFindReplace={() => setIsFindReplaceOpen(true)}
            onOpenBeforeAfter={() => setIsBeforeAfterOpen(true)}
            hasContentModifications={hasContentEdits}
          />

          {/* Context Property Inspector for Selected Object */}
          <EditorContextBar
            selectedObject={selectedObject}
            onUpdateObject={handleUpdateObject}
            onDeleteObject={handleDeleteObject}
            onDuplicateObject={handleDuplicateObject}
            selectedExistingText={selectedExistingText}
            onUpdateExistingText={handleUpdateExistingText}
            onDeleteExistingText={handleDeleteExistingText}
            selectedExistingImage={selectedExistingImage}
            onReplaceExistingImage={handleReplaceExistingImage}
            onDeleteExistingImage={handleDeleteExistingImage}
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

          {/* Scanned Page Detection Banner (Phase 3) */}
          {isScannedPageDetected && (
            <div className="editor-scanned-notice-banner">
              <div className="scanned-notice-left">
                <ScanText size={16} className="text-primary" />
                <span>
                  <strong>Scanned Page:</strong> No selectable text detected. Recognize and edit text with OCR.
                </span>
              </div>
              <button
                type="button"
                className="scanned-notice-cta"
                onClick={() => setIsOcrModalOpen(true)}
              >
                Recognize Text (OCR)
              </button>
            </div>
          )}

          {/* Core Page Canvas Stack */}
          <EditorCanvas
            pdfDoc={pdfDoc}
            pageDimensions={pageDimensions}
            zoom={zoom}
            onZoomChange={(nextZoom) => setZoom(nextZoom)}
            activeMode={activeMode}
            objects={objects}
            selectedObjectId={selectedObjectId}
            onSelectObject={(id) => {
              setSelectedObjectId(id);
              if (id) {
                setSelectedExistingTextId(null);
                setSelectedExistingImageId(null);
              }
            }}
            onAddObject={handleAddObject}
            onUpdateObject={handleUpdateObject}
            currentPage={currentPage}
            onPageVisible={(pageNum) => setCurrentPage(pageNum)}
            existingTexts={existingTexts}
            existingImages={existingImages}
            contentEdits={contentEdits}
            selectedExistingTextId={selectedExistingTextId}
            selectedExistingImageId={selectedExistingImageId}
            onSelectExistingText={(id) => {
              setSelectedExistingTextId(id);
              if (id) {
                setSelectedObjectId(null);
                setSelectedExistingImageId(null);
              }
            }}
            onSelectExistingImage={(id) => {
              setSelectedExistingImageId(id);
              if (id) {
                setSelectedObjectId(null);
                setSelectedExistingTextId(null);
              }
            }}
          />
        </div>
      </div>

      {/* Signature Modal */}
      <SignatureModal
        isOpen={signatureModalOpen}
        onClose={() => setSignatureModalOpen(false)}
        onInsert={handleInsertSignature}
      />

      {/* Find & Replace Modal (Phase 2) */}
      <FindReplaceModal
        isOpen={isFindReplaceOpen}
        onClose={() => setIsFindReplaceOpen(false)}
        onFind={handleFind}
        onReplaceNext={handleReplaceNext}
        onReplaceAll={handleReplaceAll}
        matchCount={findMatches.length}
        currentMatchIndex={currentMatchIdx}
        onNextMatch={handleNextMatch}
        onPrevMatch={handlePrevMatch}
      />

      {/* Before & After Diff Modal (Phase 2) */}
      <BeforeAfterModal
        isOpen={isBeforeAfterOpen}
        onClose={() => setIsBeforeAfterOpen(false)}
        originalThumbnail={pageThumbnails[currentPage]}
        currentPage={currentPage}
        contentEdits={contentEdits}
        objects={objects}
        onRevertAllChanges={() => {
          commitToHistory([], { modifiedTexts: {}, modifiedImages: {} });
          setSelectedObjectId(null);
          setSelectedExistingTextId(null);
          setSelectedExistingImageId(null);
        }}
      />

      {/* OCR Scanned Text Correction Modal (Phase 3) */}
      <OcrCorrectionModal
        isOpen={isOcrModalOpen}
        onClose={() => setIsOcrModalOpen(false)}
        pdfDoc={pdfDoc}
        currentPage={currentPage}
        onApplyCorrection={handleApplyOcrCorrection}
        onConvertAllLinesToObjects={handleConvertAllLinesToObjects}
      />

      {/* AcroForm Fill & Edit Modal (Phase 4) */}
      {isFormModalOpen && (originalBytesRef.current || originalBuffer) && (
        <FormFillModal
          isOpen={isFormModalOpen}
          onClose={() => setIsFormModalOpen(false)}
          pdfBuffer={
            originalBytesRef.current
              ? originalBytesRef.current.slice().buffer
              : originalBuffer!
          }
          onSaveForm={handleSaveForm}
        />
      )}

      {/* PDF Metadata Editor Modal (Phase 4) */}
      {isMetadataModalOpen && (originalBytesRef.current || originalBuffer) && (
        <MetadataModal
          isOpen={isMetadataModalOpen}
          onClose={() => setIsMetadataModalOpen(false)}
          pdfBuffer={
            originalBytesRef.current
              ? originalBytesRef.current.slice().buffer
              : originalBuffer!
          }
          onSaveMetadata={handleSaveMetadata}
        />
      )}

      {/* Document Validation & Security Audit Modal (Phase 4) */}
      {isValidationModalOpen && (originalBytesRef.current || originalBuffer) && (
        <ValidationModal
          isOpen={isValidationModalOpen}
          onClose={() => setIsValidationModalOpen(false)}
          pdfBuffer={
            originalBytesRef.current
              ? originalBytesRef.current.slice().buffer
              : originalBuffer!
          }
        />
      )}
    </div>
  );
};
