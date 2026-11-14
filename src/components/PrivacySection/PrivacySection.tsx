import React from 'react';
import { ShieldCheck, HardDrive, EyeOff, Zap } from 'lucide-react';
import './PrivacySection.css';

export const PrivacySection: React.FC = () => {
  return (
    <section id="privacy-section" className="privacy-section">
      <div className="container">
        <div className="privacy-header">
          <div className="privacy-badge">
            <ShieldCheck size={16} />
            <span>Guaranteed Local Privacy</span>
          </div>
          <h2 className="privacy-title">Your files stay on your device.</h2>
          <p className="privacy-subtitle">
            KloudPDF processes your documents directly in your browser. Your files are never uploaded to our servers.
          </p>
        </div>

        <div className="privacy-grid">
          <div className="privacy-card">
            <div className="privacy-card-icon">
              <HardDrive size={22} />
            </div>
            <h3 className="privacy-card-title">100% In-Browser Engine</h3>
            <p className="privacy-card-desc">
              All PDF operations run locally using client-side JavaScript. Document bytes never leave your device.
            </p>
          </div>

          <div className="privacy-card">
            <div className="privacy-card-icon">
              <EyeOff size={22} />
            </div>
            <h3 className="privacy-card-title">Zero Document Storage</h3>
            <p className="privacy-card-desc">
              We do not use databases, server disks, or external APIs. Files live strictly in temporary memory during your session.
            </p>
          </div>

          <div className="privacy-card">
            <div className="privacy-card-icon">
              <Zap size={22} />
            </div>
            <h3 className="privacy-card-title">Instant & Secure</h3>
            <p className="privacy-card-desc">
              No upload waiting times or bandwidth bottlenecks. Processing begins immediately right on your CPU.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
