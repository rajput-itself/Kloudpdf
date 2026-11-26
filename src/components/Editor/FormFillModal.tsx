import React, { useState, useEffect } from 'react';
import {
  FileText,
  AlertCircle,
  Check,
  RotateCcw,
  Layers,
  X,
  Lock,
  Asterisk,
} from 'lucide-react';
import { Button } from '../common/Button/Button';
import {
  inspectPdfForm,
  saveFilledPdfForm,
  FormInspectionResult,
} from '../../services/pdf/forms';
import './FormFillModal.css';

interface FormFillModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfBuffer: ArrayBuffer | null;
  onSaveForm: (newBuffer: ArrayBuffer, flattened: boolean) => void;
}

export const FormFillModal: React.FC<FormFillModalProps> = ({
  isOpen,
  onClose,
  pdfBuffer,
  onSaveForm,
}) => {
  const [inspection, setInspection] = useState<FormInspectionResult | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string | boolean>>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [selectedFilterPage, setSelectedFilterPage] = useState<number | 'all'>('all');

  useEffect(() => {
    if (!isOpen || !pdfBuffer) return;

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    inspectPdfForm(pdfBuffer.slice(0))
      .then((res) => {
        if (!isMounted) return;
        setInspection(res);
        const initialMap: Record<string, string | boolean> = {};
        res.fields.forEach((f) => {
          initialMap[f.name] = f.currentValue;
        });
        setFieldValues(initialMap);
      })
      .catch((err) => {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : 'Failed to inspect form';
        setError(`Form error: ${msg}`);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, pdfBuffer]);

  if (!isOpen) return null;

  const handleValueChange = (name: string, val: string | boolean) => {
    setFieldValues((prev) => ({
      ...prev,
      [name]: val,
    }));
  };

  const handleClearAll = () => {
    if (!inspection) return;
    if (window.confirm('Reset all form fields to empty / unchecked?')) {
      const resetMap: Record<string, string | boolean> = {};
      inspection.fields.forEach((f) => {
        resetMap[f.name] = f.type === 'checkbox' ? false : '';
      });
      setFieldValues(resetMap);
      setSuccessToast('All fields cleared');
      setTimeout(() => setSuccessToast(null), 2000);
    }
  };

  const handleSave = async (flatten: boolean = false) => {
    if (!pdfBuffer) return;

    if (
      flatten &&
      !window.confirm(
        'Flattening will permanently merge all form fields into static page artwork. Fields will no longer be interactive or fillable. Proceed?'
      )
    ) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const outputBlob = await saveFilledPdfForm(pdfBuffer.slice(0), fieldValues, {
        flatten,
      });
      const newBuffer = await outputBlob.arrayBuffer();
      onSaveForm(newBuffer, flatten);
      setSuccessToast(flatten ? 'Form flattened into artwork!' : 'Form values saved!');
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      setError(`Failed to save form: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredFields =
    inspection?.fields.filter((f) => {
      if (selectedFilterPage === 'all') return true;
      return f.pageNumber === selectedFilterPage;
    }) || [];

  return (
    <div className="form-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="form-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="form-modal-header">
          <div className="form-modal-title-group">
            <FileText size={20} className="text-primary" />
            <div>
              <h3>Fill & Edit PDF Forms</h3>
              <span className="form-modal-subtitle">
                {inspection?.hasForm
                  ? `${inspection.fieldCount} interactive form fields detected`
                  : 'Form Inspector'}
              </span>
            </div>
          </div>
          <button type="button" className="form-modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* XFA Warning Notice */}
        {inspection?.isXfa && (
          <div className="form-modal-xfa-banner" role="alert">
            <AlertCircle size={16} />
            <span>
              <strong>Dynamic XFA Form Detected:</strong> This document uses Adobe XML Forms Architecture. Dynamic XFA fields cannot be fully altered by standard AcroForm engines. Static fields remain fillable.
            </span>
          </div>
        )}

        {/* Content Body */}
        <div className="form-modal-body">
          {error && (
            <div className="form-modal-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {successToast && (
            <div className="form-modal-success">
              <Check size={16} />
              <span>{successToast}</span>
            </div>
          )}

          {isLoading ? (
            <div className="form-modal-loading">
              <div className="form-spinner" />
              <span>Inspecting interactive AcroForm fields...</span>
            </div>
          ) : !inspection?.hasForm ? (
            <div className="form-modal-empty">
              <FileText size={48} className="text-muted mb-3" />
              <h4>No Interactive Form Fields Found</h4>
              <p>
                This document does not contain active AcroForm input fields. If you want to add text or fill blank lines, use the <strong>Text</strong> or <strong>Signature</strong> tools from the editor toolbar.
              </p>
            </div>
          ) : (
            <>
              {/* Filter by Page */}
              {inspection.totalPageCount > 1 && (
                <div className="form-page-filter-strip">
                  <span className="form-filter-label">Filter Page:</span>
                  <div className="form-page-pills">
                    <button
                      type="button"
                      className={`form-page-pill ${selectedFilterPage === 'all' ? 'active' : ''}`}
                      onClick={() => setSelectedFilterPage('all')}
                    >
                      All Pages ({inspection.fieldCount})
                    </button>
                    {Array.from({ length: inspection.totalPageCount }, (_, i) => i + 1).map((p) => {
                      const countOnPage = inspection.fields.filter((f) => f.pageNumber === p).length;
                      if (countOnPage === 0) return null;
                      return (
                        <button
                          key={p}
                          type="button"
                          className={`form-page-pill ${selectedFilterPage === p ? 'active' : ''}`}
                          onClick={() => setSelectedFilterPage(p)}
                        >
                          Page {p} ({countOnPage})
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Form Fields Ledger */}
              <div className="form-fields-container">
                {filteredFields.map((field) => {
                  const val = fieldValues[field.name];
                  return (
                    <div key={field.name} className="form-field-row">
                      <div className="form-field-meta">
                        <label className="form-field-name" htmlFor={`form-input-${field.name}`}>
                          {field.name}
                          {field.isRequired && <Asterisk size={12} className="text-danger inline-icon" />}
                        </label>
                        <div className="form-field-badges">
                          <span className="form-badge-type">{field.type}</span>
                          {field.pageNumber && (
                            <span className="form-badge-page">Page {field.pageNumber}</span>
                          )}
                          {field.isReadOnly && (
                            <span className="form-badge-readonly" title="Read-only field">
                              <Lock size={10} /> Locked
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="form-field-input-wrapper">
                        {/* Text Field */}
                        {field.type === 'text' && (
                          field.isMultiline ? (
                            <textarea
                              id={`form-input-${field.name}`}
                              className="form-textarea-control"
                              value={(val as string) || ''}
                              onChange={(e) => handleValueChange(field.name, e.target.value)}
                              disabled={field.isReadOnly || isSaving}
                              rows={3}
                            />
                          ) : (
                            <input
                              id={`form-input-${field.name}`}
                              type="text"
                              className="form-input-control"
                              value={(val as string) || ''}
                              onChange={(e) => handleValueChange(field.name, e.target.value)}
                              disabled={field.isReadOnly || isSaving}
                            />
                          )
                        )}

                        {/* Checkbox */}
                        {field.type === 'checkbox' && (
                          <label className="form-checkbox-label">
                            <input
                              type="checkbox"
                              checked={Boolean(val)}
                              onChange={(e) => handleValueChange(field.name, e.target.checked)}
                              disabled={field.isReadOnly || isSaving}
                            />
                            <span>{Boolean(val) ? 'Checked' : 'Unchecked'}</span>
                          </label>
                        )}

                        {/* Radio Group */}
                        {field.type === 'radio' && (
                          <div className="form-radio-options">
                            {field.options?.map((opt) => (
                              <label key={opt} className="form-radio-label">
                                <input
                                  type="radio"
                                  name={`radio-${field.name}`}
                                  value={opt}
                                  checked={val === opt}
                                  onChange={() => handleValueChange(field.name, opt)}
                                  disabled={field.isReadOnly || isSaving}
                                />
                                <span>{opt}</span>
                              </label>
                            ))}
                          </div>
                        )}

                        {/* Dropdown */}
                        {field.type === 'dropdown' && (
                          <select
                            id={`form-input-${field.name}`}
                            className="form-select-control"
                            value={(val as string) || ''}
                            onChange={(e) => handleValueChange(field.name, e.target.value)}
                            disabled={field.isReadOnly || isSaving}
                          >
                            <option value="">-- Select option --</option>
                            {field.options?.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="form-modal-footer">
          <div className="form-footer-left">
            {inspection?.hasForm && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearAll}
                disabled={isSaving}
                icon={<RotateCcw size={14} />}
              >
                Clear All Values
              </Button>
            )}
          </div>

          <div className="form-footer-right">
            <Button variant="secondary" size="md" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            {inspection?.hasForm && (
              <>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => handleSave(true)}
                  disabled={isSaving}
                  icon={<Layers size={15} />}
                  title="Permanently bake fields into artwork to prevent further editing"
                >
                  Flatten Form
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => handleSave(false)}
                  isLoading={isSaving}
                  disabled={isSaving}
                  icon={<Check size={16} />}
                >
                  Save Form Values
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
