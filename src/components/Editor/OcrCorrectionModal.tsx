import React, { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  ScanText,
  AlertCircle,
  Check,
  Languages,
  X,
  Sparkles,
  Layers,
  ArrowRight,
  Eye,
} from 'lucide-react';
import { Button } from '../common/Button/Button';
import {
  OcrLanguage,
  OcrPageDetail,
  OcrLineItem,
  runOcrOnSinglePdfPage,
} from '../../services/pdf/ocr';
import { StandardFontFamily } from '../../types/editor';
import './OcrCorrectionModal.css';

interface OcrCorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfDoc: pdfjsLib.PDFDocumentProxy | null;
  currentPage: number;
  onApplyCorrection: (params: {
    line: OcrLineItem;
    replacementText: string;
    fontFamily: StandardFontFamily;
    fontSize: number;
    color: string;
    bgColor: string;
  }) => void;
  onConvertAllLinesToObjects: (
    lines: OcrLineItem[],
    options: { fontFamily: StandardFontFamily; color: string }
  ) => void;
}

const SUPPORTED_LANGUAGES: { id: OcrLanguage; name: string }[] = [
  { id: 'eng', name: 'English' },
  { id: 'hin', name: 'Hindi (हिन्दी)' },
  { id: 'spa', name: 'Spanish (Español)' },
  { id: 'fra', name: 'French (Français)' },
  { id: 'deu', name: 'German (Deutsch)' },
];

export const OcrCorrectionModal: React.FC<OcrCorrectionModalProps> = ({
  isOpen,
  onClose,
  pdfDoc,
  currentPage,
  onApplyCorrection,
  onConvertAllLinesToObjects,
}) => {
  const [language, setLanguage] = useState<OcrLanguage>('eng');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [pageDetail, setPageDetail] = useState<OcrPageDetail | null>(null);

  // Selected line for correction
  const [selectedLine, setSelectedLine] = useState<OcrLineItem | null>(null);
  const [replacementText, setReplacementText] = useState<string>('');
  const [fontFamily, setFontFamily] = useState<StandardFontFamily>('Helvetica');
  const [fontSize, setFontSize] = useState<number>(14);
  const [textColor, setTextColor] = useState<string>('#000000');
  const [bgColor, setBgColor] = useState<string>('#ffffff');
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Reset or run when page changes
  useEffect(() => {
    if (isOpen) {
      setPageDetail(null);
      setSelectedLine(null);
      setError(null);
      setSuccessToast(null);
    }
  }, [isOpen, currentPage]);

  if (!isOpen) return null;

  const handleRunOcr = async () => {
    if (!pdfDoc) return;
    setIsProcessing(true);
    setError(null);
    setProgressPercent(0);
    setProgressMsg('Initializing Web Worker...');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result = await runOcrOnSinglePdfPage(pdfDoc, currentPage, {
        language,
        scale: 2.0,
        signal: controller.signal,
        onProgress: (msg, pct) => {
          setProgressMsg(msg);
          setProgressPercent(Math.round(pct * 100));
        },
      });

      setPageDetail(result);
      if (result.lines.length > 0) {
        selectLineForCorrection(result.lines[0]!);
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setProgressMsg('OCR cancelled');
      } else {
        const msg = err instanceof Error ? err.message : 'OCR failed';
        setError(`Recognition error: ${msg}`);
      }
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsProcessing(false);
  };

  const selectLineForCorrection = (line: OcrLineItem) => {
    setSelectedLine(line);
    setReplacementText(line.text);
    if (line.pdfCoords) {
      const calculatedSize = Math.max(10, Math.round(line.pdfCoords.height * 0.8));
      setFontSize(calculatedSize);
    } else {
      setFontSize(14);
    }
  };

  const handleApply = () => {
    if (!selectedLine || !replacementText.trim()) return;

    onApplyCorrection({
      line: selectedLine,
      replacementText,
      fontFamily,
      fontSize,
      color: textColor,
      bgColor,
    });

    setSuccessToast(`Applied correction: "${replacementText.slice(0, 24)}..."`);
    setTimeout(() => setSuccessToast(null), 2500);
  };

  const handleConvertAll = () => {
    if (!pageDetail || pageDetail.lines.length === 0) return;
    if (
      window.confirm(
        `Convert all ${pageDetail.lines.length} recognized text lines on Page ${currentPage} into editable text objects?`
      )
    ) {
      onConvertAllLinesToObjects(pageDetail.lines, { fontFamily, color: textColor });
      onClose();
    }
  };

  return (
    <div className="ocr-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="ocr-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="ocr-modal-header">
          <div className="ocr-modal-title-group">
            <ScanText size={20} className="text-primary" />
            <h3>Recognize Scanned Text (Page {currentPage})</h3>
          </div>
          <button type="button" className="ocr-modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Subhead / Notice */}
        <div className="ocr-modal-notice">
          <p>
            Client-side OCR extracts text from scanned pages. You can correct typos in-place or convert all recognized lines into editable vector text.
          </p>
        </div>

        {/* Content Body */}
        <div className="ocr-modal-content">
          {error && (
            <div className="ocr-modal-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {successToast && (
            <div className="ocr-modal-success">
              <Check size={16} />
              <span>{successToast}</span>
            </div>
          )}

          {/* Configuration & Action Strip */}
          <div className="ocr-config-strip">
            <div className="ocr-lang-picker">
              <Languages size={15} />
              <span>Language:</span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as OcrLanguage)}
                disabled={isProcessing}
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="ocr-run-buttons">
              {isProcessing ? (
                <Button variant="danger" size="sm" onClick={handleCancel}>
                  Cancel
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleRunOcr}
                  icon={<Sparkles size={14} />}
                >
                  {pageDetail ? 'Re-Run OCR' : 'Start OCR on Page'}
                </Button>
              )}
            </div>
          </div>

          {/* Processing State */}
          {isProcessing && (
            <div className="ocr-modal-processing">
              <div className="ocr-spinner" />
              <div className="ocr-progress-info">
                <span>{progressMsg}</span>
                <div className="ocr-bar-track">
                  <div className="ocr-bar-fill" style={{ width: `${progressPercent}%` }} />
                </div>
              </div>
            </div>
          )}

          {/* Recognition Results */}
          {!isProcessing && pageDetail && (
            <div className="ocr-results-split">
              {/* Left Column: List of detected lines */}
              <div className="ocr-lines-column">
                <div className="ocr-lines-header">
                  <span>Detected Lines ({pageDetail.lines.length})</span>
                  <span className="ocr-conf-tag">Confidence: {pageDetail.confidence}%</span>
                </div>

                {pageDetail.lines.length === 0 ? (
                  <div className="ocr-lines-empty">No text lines detected on this page.</div>
                ) : (
                  <div className="ocr-lines-scroll">
                    {pageDetail.lines.map((l) => {
                      const isSelected = selectedLine?.id === l.id;
                      return (
                        <button
                          key={l.id}
                          type="button"
                          className={`ocr-line-item-btn ${isSelected ? 'selected' : ''}`}
                          onClick={() => selectLineForCorrection(l)}
                        >
                          <span className="ocr-line-item-text">{l.text}</span>
                          <span className="ocr-line-item-conf">{l.confidence}%</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {pageDetail.lines.length > 0 && (
                  <button
                    type="button"
                    className="ocr-convert-all-btn"
                    onClick={handleConvertAll}
                    title="Turn all lines into editable canvas text boxes"
                  >
                    <Layers size={14} />
                    <span>Convert All Lines to Text Boxes</span>
                  </button>
                )}
              </div>

              {/* Right Column: Correction & Inpainting Controls */}
              {selectedLine ? (
                <div className="ocr-correction-column">
                  <h4 className="ocr-correction-heading">
                    <Eye size={15} />
                    <span>Scanned Text Inpainting & Replacement</span>
                  </h4>

                  {/* Original text snippet */}
                  <div className="ocr-field-group">
                    <label className="ocr-field-label">Original Scanned Text:</label>
                    <div className="ocr-original-text-box">{selectedLine.text}</div>
                  </div>

                  {/* Replacement text input */}
                  <div className="ocr-field-group">
                    <label className="ocr-field-label">Corrected / Replacement Text:</label>
                    <input
                      type="text"
                      className="ocr-text-input"
                      value={replacementText}
                      onChange={(e) => setReplacementText(e.target.value)}
                      placeholder="Enter replacement text..."
                    />
                  </div>

                  {/* Formatting Controls */}
                  <div className="ocr-formatting-grid">
                    <div className="ocr-field-group">
                      <label className="ocr-field-label">Font Family:</label>
                      <select
                        className="ocr-select-control"
                        value={fontFamily}
                        onChange={(e) => setFontFamily(e.target.value as StandardFontFamily)}
                      >
                        <option value="Helvetica">Helvetica (Sans-Serif)</option>
                        <option value="TimesRoman">Times Roman (Serif)</option>
                        <option value="Courier">Courier (Monospace)</option>
                      </select>
                    </div>

                    <div className="ocr-field-group">
                      <label className="ocr-field-label">Font Size:</label>
                      <input
                        type="number"
                        className="ocr-num-input"
                        value={fontSize}
                        min={8}
                        max={72}
                        onChange={(e) => setFontSize(Number(e.target.value))}
                      />
                    </div>

                    <div className="ocr-field-group">
                      <label className="ocr-field-label">Text Color:</label>
                      <div className="ocr-color-wrapper">
                        <input
                          type="color"
                          value={textColor}
                          onChange={(e) => setTextColor(e.target.value)}
                        />
                        <span>{textColor}</span>
                      </div>
                    </div>

                    <div className="ocr-field-group">
                      <label className="ocr-field-label">Paper Fill (Inpaint):</label>
                      <div className="ocr-color-wrapper">
                        <input
                          type="color"
                          value={bgColor}
                          onChange={(e) => setBgColor(e.target.value)}
                        />
                        <span>{bgColor}</span>
                      </div>
                    </div>
                  </div>

                  {/* Visual Preview */}
                  <div className="ocr-preview-comparison">
                    <div className="ocr-preview-box">
                      <span className="ocr-preview-sub">Original:</span>
                      <span className="ocr-preview-orig">{selectedLine.text}</span>
                    </div>
                    <ArrowRight size={16} className="ocr-preview-arrow" />
                    <div
                      className="ocr-preview-box ocr-preview-after"
                      style={{ backgroundColor: bgColor }}
                    >
                      <span className="ocr-preview-sub">Preview:</span>
                      <span
                        style={{
                          fontFamily,
                          fontSize: `${fontSize}px`,
                          color: textColor,
                          fontWeight: 500,
                        }}
                      >
                        {replacementText || '...'}
                      </span>
                    </div>
                  </div>

                  <div className="ocr-apply-actions">
                    <Button
                      variant="primary"
                      size="md"
                      onClick={handleApply}
                      disabled={!replacementText.trim()}
                      icon={<Check size={16} />}
                    >
                      Apply Replacement to Page
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="ocr-correction-empty">
                  <span>Select a detected line on the left to correct or replace it.</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="ocr-modal-footer">
          <span className="ocr-modal-privacy-tag">
            100% In-Browser OCR • Document never leaves your device
          </span>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
};
