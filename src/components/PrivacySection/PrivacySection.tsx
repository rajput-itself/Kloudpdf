import React from 'react';
import { HardDrive, EyeOff, Cpu } from 'lucide-react';
import './PrivacySection.css';

export const PrivacySection: React.FC = () => {
  return (
    <section id="privacy-section" className="privacy-section">
      <div className="container">
        <div className="privacy-layout">
          <div className="privacy-lead">
            <h2 className="privacy-heading">Client-side runtime architecture</h2>
            <p className="privacy-subtitle">
              PDF parsing, rendering, OCR recognition, and DOCX export execute inside your browser tab memory without backend storage.
            </p>
          </div>

          <div className="privacy-specs">
            <div className="privacy-spec-item">
              <div className="privacy-spec-head">
                <HardDrive size={15} className="privacy-spec-icon" aria-hidden="true" />
                <h3>Local file memory</h3>
              </div>
              <p>Bytes read directly via browser File API and discarded on tab close.</p>
            </div>

            <div className="privacy-spec-item">
              <div className="privacy-spec-head">
                <EyeOff size={15} className="privacy-spec-icon" aria-hidden="true" />
                <h3>Zero document uploads</h3>
              </div>
              <p>No server ingestion queues, no file retention, and no third-party relay.</p>
            </div>

            <div className="privacy-spec-item">
              <div className="privacy-spec-head">
                <Cpu size={15} className="privacy-spec-icon" aria-hidden="true" />
                <h3>Native browser engines</h3>
              </div>
              <p>Powered by PDF.js, pdf-lib, and WebAssembly Tesseract OCR offline.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
