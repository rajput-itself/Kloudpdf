import React from 'react';
import { CheckCircle2, Download, RefreshCw, FileText, FileImage, Image } from 'lucide-react';
import { Button } from '../../components/common/Button/Button';
import { ProcessedResult } from '../../types';
import { formatBytes, downloadBlob } from '../../utils/file';
import './ToolWorkspace.css';

interface CompletedViewProps {
  result: ProcessedResult;
  onReset: () => void;
}

export const CompletedView: React.FC<CompletedViewProps> = ({ result, onReset }) => {
  const isZip = result.filename.toLowerCase().endsWith('.zip');
  const isPng = result.filename.toLowerCase().endsWith('.png');
  const isWebp = result.filename.toLowerCase().endsWith('.webp');
  const isJpg = result.filename.toLowerCase().endsWith('.jpg') || result.filename.toLowerCase().endsWith('.jpeg');

  let downloadLabel = 'Download PDF';
  if (isZip) downloadLabel = 'Download All (ZIP)';
  else if (isPng) downloadLabel = 'Download PNG';
  else if (isWebp) downloadLabel = 'Download WebP';
  else if (isJpg) downloadLabel = 'Download JPG';

  const handleDownloadMain = () => {
    downloadBlob(result.blob, result.filename);
  };

  const handleDownloadItem = (blob: Blob, filename: string) => {
    downloadBlob(blob, filename);
  };

  return (
    <div className="completed-container">
      <div className="completed-icon-wrapper">
        <CheckCircle2 size={48} className="completed-check-icon" />
      </div>

      <h2 className="completed-title">Your file is ready!</h2>
      <p className="completed-subtitle">
        Document processing finished successfully and securely on your device.
      </p>

      <div className="completed-file-card">
        <div className="completed-file-icon">
          {isPng || isWebp || isJpg ? <FileImage size={24} /> : <FileText size={24} />}
        </div>
        <div className="completed-file-info">
          <span className="completed-filename">{result.filename}</span>
          <span className="completed-filesize">{formatBytes(result.blob.size)}</span>
        </div>
      </div>

      <div className="completed-actions">
        <Button
          variant="primary"
          size="lg"
          icon={<Download size={18} />}
          onClick={handleDownloadMain}
        >
          {downloadLabel}
        </Button>

        <Button
          variant="secondary"
          size="lg"
          icon={<RefreshCw size={16} />}
          onClick={onReset}
        >
          Start Again
        </Button>
      </div>

      {/* Individual Page Downloads Section (for multi-page image conversions) */}
      {result.imageItems && result.imageItems.length > 1 && (
        <div className="completed-individual-section">
          <div className="completed-section-header">
            <h4 className="completed-section-title">
              <Image size={18} className="text-primary" />
              <span>Individual Page Downloads ({result.imageItems.length})</span>
            </h4>
            <span className="text-xs text-secondary">
              Download specific pages without extracting the ZIP
            </span>
          </div>

          <div className="completed-items-grid">
            {result.imageItems.map((item) => (
              <div key={item.pageNumber} className="completed-item-card">
                <div className="completed-item-preview">
                  <img src={item.url} alt={`Page ${item.pageNumber}`} loading="lazy" />
                  <span className="completed-item-badge">Page {item.pageNumber}</span>
                </div>
                <div className="completed-item-footer">
                  <span className="completed-item-size">{formatBytes(item.blob.size)}</span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleDownloadItem(item.blob, item.filename)}
                    title={`Download ${item.filename}`}
                  >
                    <Download size={13} />
                    <span>Save</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="completed-note">
        Files are cleared from memory when you reset or close the window.
      </p>
    </div>
  );
};
