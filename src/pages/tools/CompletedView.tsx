import React from 'react';
import { CheckCircle2, Download, RefreshCw, FileText } from 'lucide-react';
import { Button } from '../../components/common/Button/Button';
import { ProcessedResult } from '../../types';
import { formatBytes, downloadBlob } from '../../utils/file';
import './ToolWorkspace.css';

interface CompletedViewProps {
  result: ProcessedResult;
  onReset: () => void;
}

export const CompletedView: React.FC<CompletedViewProps> = ({ result, onReset }) => {
  const handleDownload = () => {
    downloadBlob(result.blob, result.filename);
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
          <FileText size={24} />
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
          onClick={handleDownload}
        >
          Download PDF
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

      <p className="completed-note">
        Files are cleared from memory when you reset or close the window.
      </p>
    </div>
  );
};
