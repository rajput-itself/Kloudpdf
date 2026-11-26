import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  FileCheck2,
  X,
  FileCode,
  Lock,
  Layers,
  KeyRound,
} from 'lucide-react';
import { Button } from '../common/Button/Button';
import {
  validatePdfStructure,
  PdfValidationReport,
} from '../../services/pdf/validation';
import './ValidationModal.css';

interface ValidationModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfBuffer: ArrayBuffer | null;
}

export const ValidationModal: React.FC<ValidationModalProps> = ({
  isOpen,
  onClose,
  pdfBuffer,
}) => {
  const [report, setReport] = useState<PdfValidationReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen || !pdfBuffer) return;

    let isMounted = true;
    setIsLoading(true);

    validatePdfStructure(pdfBuffer.slice(0))
      .then((res) => {
        if (!isMounted) return;
        setReport(res);
      })
      .catch(() => {
        // Fallback
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, pdfBuffer]);

  if (!isOpen) return null;

  return (
    <div className="val-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="val-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="val-modal-header">
          <div className="val-modal-title-group">
            <FileCheck2 size={20} className="text-primary" />
            <div>
              <h3>PDF Document Validation Audit</h3>
              <span className="val-modal-subtitle">
                Structural & Security Health Verification
              </span>
            </div>
          </div>
          <button type="button" className="val-modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="val-modal-body">
          {isLoading ? (
            <div className="val-modal-loading">
              <div className="val-spinner" />
              <span>Auditing PDF binary structure and security posture...</span>
            </div>
          ) : report ? (
            <>
              {/* Overall Rating Banner */}
              <div
                className={`val-rating-banner ${
                  report.securityRating === 'Secure'
                    ? 'rating-secure'
                    : report.securityRating === 'Caution'
                    ? 'rating-caution'
                    : 'rating-danger'
                }`}
              >
                <div className="val-rating-left">
                  {report.securityRating === 'Secure' ? (
                    <ShieldCheck size={28} />
                  ) : report.securityRating === 'Caution' ? (
                    <AlertTriangle size={28} />
                  ) : (
                    <AlertCircle size={28} />
                  )}
                  <div>
                    <h4 className="val-rating-title">Security Rating: {report.securityRating}</h4>
                    <p className="val-rating-desc">
                      {report.securityRating === 'Secure'
                        ? 'Document structure conforms to ISO standards with no active script threats.'
                        : report.securityRating === 'Caution'
                        ? 'Minor compatibility notes or form structures detected.'
                        : 'Potential security concerns or structural anomalies detected.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Structural Metrics */}
              <div className="val-metrics-grid">
                <div className="val-metric-card">
                  <span className="val-metric-label">PDF Version</span>
                  <span className="val-metric-val">{report.pdfVersion}</span>
                </div>
                <div className="val-metric-card">
                  <span className="val-metric-label">Page Count</span>
                  <span className="val-metric-val">{report.pageCount}</span>
                </div>
                <div className="val-metric-card">
                  <span className="val-metric-label">File Size</span>
                  <span className="val-metric-val">
                    {(report.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </div>
                <div className="val-metric-card">
                  <span className="val-metric-label">Linearized (Web Fast)</span>
                  <span className="val-metric-val">{report.hasLinearization ? 'Yes' : 'No'}</span>
                </div>
              </div>

              {/* Feature Checklist */}
              <div className="val-checklist">
                <h5 className="val-section-title">Security & Feature Inspection</h5>
                <div className="val-checklist-items">
                  <div className="val-check-row">
                    <div className="val-check-left">
                      <Lock size={15} />
                      <span>Encryption & Passwords:</span>
                    </div>
                    <span className={`val-pill ${report.isEncrypted ? 'pill-warning' : 'pill-ok'}`}>
                      {report.isEncrypted ? 'Encrypted' : 'Unencrypted'}
                    </span>
                  </div>

                  <div className="val-check-row">
                    <div className="val-check-left">
                      <FileCode size={15} />
                      <span>Active JavaScript Actions (/JS):</span>
                    </div>
                    <span className={`val-pill ${report.hasJavaScript ? 'pill-danger' : 'pill-ok'}`}>
                      {report.hasJavaScript ? 'Detected' : 'None'}
                    </span>
                  </div>

                  <div className="val-check-row">
                    <div className="val-check-left">
                      <Layers size={15} />
                      <span>AcroForm Fields:</span>
                    </div>
                    <span className="val-pill pill-neutral">
                      {report.hasAcroForms ? 'Interactive Forms Present' : 'No Form Fields'}
                    </span>
                  </div>

                  <div className="val-check-row">
                    <div className="val-check-left">
                      <AlertTriangle size={15} />
                      <span>Dynamic XFA Architecture:</span>
                    </div>
                    <span className={`val-pill ${report.hasXfaForms ? 'pill-warning' : 'pill-ok'}`}>
                      {report.hasXfaForms ? 'XFA XML Form' : 'Standard / None'}
                    </span>
                  </div>

                  <div className="val-check-row">
                    <div className="val-check-left">
                      <KeyRound size={15} />
                      <span>Digital Signatures (/Sig):</span>
                    </div>
                    <span className="val-pill pill-neutral">
                      {report.hasDigitalSignatures ? 'Signed' : 'Unsigned'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Audit Findings */}
              {report.issues.length > 0 && (
                <div className="val-issues-section">
                  <h5 className="val-section-title">Audit Log ({report.issues.length})</h5>
                  <div className="val-issues-list">
                    {report.issues.map((iss, idx) => (
                      <div
                        key={idx}
                        className={`val-issue-item ${
                          iss.severity === 'error'
                            ? 'issue-error'
                            : iss.severity === 'warning'
                            ? 'issue-warning'
                            : 'issue-info'
                        }`}
                      >
                        <span className="val-issue-sev">{iss.severity.toUpperCase()}</span>
                        <span className="val-issue-msg">{iss.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="val-modal-empty">Failed to generate document validation report.</div>
          )}
        </div>

        {/* Footer */}
        <div className="val-modal-footer">
          <span className="val-footer-privacy">100% In-Browser Document Audit</span>
          <Button variant="secondary" size="md" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
