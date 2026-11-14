import React, { useState, useEffect } from 'react';
import { Menu, X, Shield } from 'lucide-react';
import './Header.css';

interface HeaderProps {
  onNavigateHome: () => void;
  onOpenAbout?: () => void;
  onOpenContact?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onNavigateHome,
  onOpenAbout,
  onOpenContact,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile menu on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  const handleToolsClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onNavigateHome();
    setMobileMenuOpen(false);
    setTimeout(() => {
      const toolsEl = document.getElementById('tools-section');
      if (toolsEl) {
        toolsEl.scrollIntoView({ behavior: 'smooth' });
      }
    }, 50);
  };

  const handleAboutClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    if (onOpenAbout) {
      onOpenAbout();
    } else {
      const el = document.getElementById('privacy-section');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleContactClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    if (onOpenContact) {
      onOpenContact();
    }
  };

  return (
    <>
      <header className="header">
        <div className="container header-container">
          <a
            href="/"
            className="header-brand"
            onClick={(e) => {
              e.preventDefault();
              onNavigateHome();
              setMobileMenuOpen(false);
            }}
            aria-label="KloudPDF Home"
          >
            <div className="header-logo-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2Z" fill="#1a73e8"/>
                <path d="M14 2V8H20" fill="#E8F0FE"/>
                <path d="M9 13H15M9 16H15M9 19H13" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="header-brand-text">
              <span className="header-brand-name">KloudPDF</span>
              <span className="header-brand-tagline">PDF tools. Made simple.</span>
            </div>
          </a>

          {/* Desktop Navigation */}
          <nav className="header-nav" aria-label="Main Navigation">
            <a href="#tools" onClick={handleToolsClick} className="header-link">
              PDF Tools
            </a>
            <a href="#about" onClick={handleAboutClick} className="header-link">
              About
            </a>
            <a href="#contact" onClick={handleContactClick} className="header-link">
              Contact
            </a>
            <div className="header-privacy-badge" title="Local browser-only processing">
              <Shield size={14} className="badge-shield-icon" />
              <span>100% Local</span>
            </div>
          </nav>

          {/* Mobile Hamburger Toggle (minimum 44x44px touch target) */}
          <button
            className="header-mobile-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="header-mobile-menu" role="dialog" aria-label="Mobile Navigation">
            <a href="#tools" onClick={handleToolsClick} className="header-mobile-link">
              PDF Tools
            </a>
            <button
              type="button"
              onClick={handleAboutClick}
              className="header-mobile-link header-mobile-btn"
            >
              About
            </button>
            <button
              type="button"
              onClick={handleContactClick}
              className="header-mobile-link header-mobile-btn"
            >
              Contact
            </button>
            <div className="header-mobile-badge">
              <Shield size={16} />
              <span>100% Local & Private Processing</span>
            </div>
          </div>
        )}
      </header>

      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          className="header-mobile-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}
    </>
  );
};
