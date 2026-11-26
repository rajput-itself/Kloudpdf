import React, { useState, useEffect } from 'react';
import {
  FileText,
  AlertCircle,
  Check,
  Trash2,
  X,
  Info,
  Calendar,
} from 'lucide-react';
import { Button } from '../common/Button/Button';
import {
  extractPdfMetadata,
  updatePdfMetadata,
  sanitizePdfMetadata,
  PdfMetadata,
} from '../../services/pdf/metadata';
import './MetadataModal.css';

interface MetadataModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfBuffer: ArrayBuffer | null;
  onSaveMetadata: (newBuffer: ArrayBuffer) => void;
}

export const MetadataModal: React.FC<MetadataModalProps> = ({
  isOpen,
  onClose,
  pdfBuffer,
  onSaveMetadata,
}) => {
  const [metadata, setMetadata] = useState<PdfMetadata | null>(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [subject, setSubject] = useState('');
  const [keywordsStr, setKeywordsStr] = useState('');
  const [creator, setCreator] = useState('');
  const [producer, setProducer] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !pdfBuffer) return;

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    extractPdfMetadata(pdfBuffer.slice(0))
      .then((data) => {
        if (!isMounted) return;
        setMetadata(data);
        setTitle(data.title);
        setAuthor(data.author);
        setSubject(data.subject);
        setKeywordsStr(data.keywords.join(', '));
        setCreator(data.creator);
        setProducer(data.producer);
      })
      .catch((err) => {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : 'Failed to read metadata';
        setError(`Metadata extraction error: ${msg}`);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, pdfBuffer]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!pdfBuffer) return;
    setIsSaving(true);
    setError(null);

    try {
      const keywords = keywordsStr
        .split(/[,;]/)
        .map((k) => k.trim())
        .filter(Boolean);

      const blob = await updatePdfMetadata(pdfBuffer.slice(0), {
        title,
        author,
        subject,
        keywords,
        creator,
        producer,
      });

      const newBuffer = await blob.arrayBuffer();
      onSaveMetadata(newBuffer);
      setSuccessToast('Metadata updated successfully!');
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      setError(`Failed to update metadata: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSanitize = async () => {
    if (!pdfBuffer) return;
    if (
      !window.confirm(
        'Permanently strip all standard Document Info fields and the Catalog XMP metadata stream? This action cannot be undone.'
      )
    ) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const blob = await sanitizePdfMetadata(pdfBuffer.slice(0));
      const newBuffer = await blob.arrayBuffer();
      onSaveMetadata(newBuffer);
      setSuccessToast('All document metadata sanitized and stripped!');
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sanitization failed';
      setError(`Failed to sanitize metadata: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="meta-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="meta-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="meta-modal-header">
          <div className="meta-modal-title-group">
            <FileText size={20} className="text-primary" />
            <h3>PDF Document Metadata</h3>
          </div>
          <button type="button" className="meta-modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Informational Disclaimer */}
        <div className="meta-modal-notice">
          <Info size={15} className="text-primary flex-shrink-0" />
          <p>
            Modifying information fields alters the standard PDF Info dictionary and catalog XMP stream. Internal font tables or embedded image EXIF data are not rewritten.
          </p>
        </div>

        {/* Content Body */}
        <div className="meta-modal-body">
          {error && (
            <div className="meta-modal-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {successToast && (
            <div className="meta-modal-success">
              <Check size={16} />
              <span>{successToast}</span>
            </div>
          )}

          {isLoading ? (
            <div className="meta-modal-loading">
              <div className="meta-spinner" />
              <span>Reading document metadata streams...</span>
            </div>
          ) : (
            <div className="meta-fields-grid">
              {/* Title */}
              <div className="meta-field-group">
                <label className="meta-field-label">Document Title</label>
                <input
                  type="text"
                  className="meta-input-control"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Annual Financial Report"
                  disabled={isSaving}
                />
              </div>

              {/* Author */}
              <div className="meta-field-group">
                <label className="meta-field-label">Author</label>
                <input
                  type="text"
                  className="meta-input-control"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="e.g. Jane Doe"
                  disabled={isSaving}
                />
              </div>

              {/* Subject */}
              <div className="meta-field-group">
                <label className="meta-field-label">Subject</label>
                <input
                  type="text"
                  className="meta-input-control"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Summary of quarterly operations"
                  disabled={isSaving}
                />
              </div>

              {/* Keywords */}
              <div className="meta-field-group">
                <label className="meta-field-label">Keywords (comma-separated)</label>
                <input
                  type="text"
                  className="meta-input-control"
                  value={keywordsStr}
                  onChange={(e) => setKeywordsStr(e.target.value)}
                  placeholder="finance, report, 2026, audit"
                  disabled={isSaving}
                />
              </div>

              {/* Creator Application */}
              <div className="meta-field-group">
                <label className="meta-field-label">Creator Application</label>
                <input
                  type="text"
                  className="meta-input-control"
                  value={creator}
                  onChange={(e) => setCreator(e.target.value)}
                  placeholder="e.g. Microsoft Word / KloudPDF"
                  disabled={isSaving}
                />
              </div>

              {/* Producer */}
              <div className="meta-field-group">
                <label className="meta-field-label">PDF Producer</label>
                <input
                  type="text"
                  className="meta-input-control"
                  value={producer}
                  onChange={(e) => setProducer(e.target.value)}
                  placeholder="e.g. Quartz PDFContext / pdf-lib"
                  disabled={isSaving}
                />
              </div>

              {/* Dates & Technical Info */}
              {metadata && (
                <div className="meta-technical-box">
                  <div className="meta-tech-item">
                    <Calendar size={14} className="text-muted" />
                    <span>
                      Created:{' '}
                      {metadata.creationDate
                        ? metadata.creationDate.toLocaleDateString()
                        : 'Not specified'}
                    </span>
                  </div>
                  <div className="meta-tech-item">
                    <Calendar size={14} className="text-muted" />
                    <span>
                      Modified:{' '}
                      {metadata.modificationDate
                        ? metadata.modificationDate.toLocaleDateString()
                        : 'Not specified'}
                    </span>
                  </div>
                  <div className="meta-tech-item">
                    <span>
                      XMP XML Stream:{' '}
                      <strong className={metadata.hasXmpMetadata ? 'text-primary' : 'text-muted'}>
                        {metadata.hasXmpMetadata ? 'Present' : 'None'}
                      </strong>
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="meta-modal-footer">
          <Button
            variant="danger"
            size="sm"
            onClick={handleSanitize}
            disabled={isSaving || isLoading}
            icon={<Trash2 size={14} />}
            title="Permanently remove title, author, subject, and XMP streams"
          >
            Sanitize / Strip All
          </Button>

          <div className="meta-footer-right">
            <Button variant="secondary" size="md" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleSave}
              isLoading={isSaving}
              disabled={isSaving || isLoading}
              icon={<Check size={16} />}
            >
              Save Metadata
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
