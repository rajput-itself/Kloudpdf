import React from 'react';
import { Loader2 } from 'lucide-react';
import './ToolWorkspace.css';

interface ProcessingViewProps {
  statusText?: string;
  progressDetail?: string; // measurable progress e.g. "Page 3 of 12"
}

export const ProcessingView: React.FC<ProcessingViewProps> = ({
  statusText = 'Processing your document...',
  progressDetail,
}) => {
  return (
    <div className="processing-container" role="status" aria-live="polite">
      <div className="processing-spinner-box">
        <Loader2 className="processing-spinner-icon" size={40} />
      </div>
      <h3 className="processing-title">{statusText}</h3>
      {progressDetail && (
        <p className="processing-detail">{progressDetail}</p>
      )}
      <p className="processing-privacy-hint">
        Processing securely in local browser memory...
      </p>
    </div>
  );
};
