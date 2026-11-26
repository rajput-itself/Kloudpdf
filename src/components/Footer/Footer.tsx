import React from 'react';
import './Footer.css';

interface FooterProps {
  onNavigateHome: () => void;
  onOpenPrivacy?: () => void;
  onOpenTerms?: () => void;
  onOpenAbout?: () => void;
  onOpenContact?: () => void;
  onOpenFaq?: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  onNavigateHome,
  onOpenPrivacy,
  onOpenTerms,
  onOpenAbout,
  onOpenContact,
  onOpenFaq,
}) => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="container footer-container">
        <div className="footer-top">
          <div className="footer-brand-col">
            <a
              href="/"
              className="footer-brand"
              onClick={(e) => {
                e.preventDefault();
                onNavigateHome();
              }}
            >
              <span className="footer-brand-title">KloudPDF</span>
            </a>
            <p className="footer-brand-tagline">PDF tools. Made simple.</p>
            <p className="footer-brand-privacy-note">
              Client-side PDF processing. Your documents never leave your browser.
            </p>
          </div>

          <div className="footer-links-group">
            <div className="footer-nav-col">
              <h4 className="footer-heading">Platform</h4>
              <ul className="footer-list">
                <li>
                  <a
                    href="#tools"
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigateHome();
                      setTimeout(() => {
                        document.getElementById('tools-section')?.scrollIntoView({ behavior: 'smooth' });
                      }, 50);
                    }}
                  >
                    PDF Tools
                  </a>
                </li>
                <li>
                  <button
                    type="button"
                    className="footer-link-btn"
                    onClick={onOpenAbout}
                  >
                    About KloudPDF
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className="footer-link-btn"
                    onClick={onOpenContact}
                  >
                    Contact & Feedback
                  </button>
                </li>
                {onOpenFaq && (
                  <li>
                    <button
                      type="button"
                      className="footer-link-btn"
                      onClick={onOpenFaq}
                    >
                      FAQ & Capabilities
                    </button>
                  </li>
                )}
              </ul>
            </div>

            <div className="footer-nav-col">
              <h4 className="footer-heading">Legal & Privacy</h4>
              <ul className="footer-list">
                <li>
                  <button
                    type="button"
                    className="footer-link-btn"
                    onClick={onOpenPrivacy}
                  >
                    Privacy Policy
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className="footer-link-btn"
                    onClick={onOpenTerms}
                  >
                    Terms of Service
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <p className="footer-copyright">
            &copy; {currentYear} KloudPDF. All rights reserved. Built with privacy in mind.
          </p>
          <p className="footer-tech-note">
            100% Client-Side Processing
          </p>
        </div>
      </div>
    </footer>
  );
};
