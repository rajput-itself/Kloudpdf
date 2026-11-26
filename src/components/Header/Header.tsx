import React, { useState, useEffect } from 'react';
import { Menu, X, ShieldCheck, Moon, Sun } from 'lucide-react';
import { ToolId } from '../../types';
import './Header.css';

interface HeaderProps {
  onNavigateHome: () => void;
  onSelectTool?: (toolId: ToolId) => void;
  onOpenAbout?: () => void;
  onOpenContact?: () => void;
  onOpenFaq?: () => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onNavigateHome,
  onOpenAbout,
  onOpenContact,
  onOpenFaq,
  theme = 'light',
  onToggleTheme,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
      document.getElementById('tools-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  };

  const handleAboutClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    if (onOpenAbout) {
      onOpenAbout();
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
          >
            <img
              src={`${import.meta.env.BASE_URL}kloudpdf-logo.png`}
              alt="KloudPDF — Complete PDF Solutions"
              className="header-brand-logo"
              width={162}
              height={54}
            />
          </a>

          <nav className="header-nav" aria-label="Main Navigation">
            <a href="#tools" onClick={handleToolsClick} className="header-link">
              Tools
            </a>
            <a href="#about" onClick={handleAboutClick} className="header-link">
              About
            </a>
            {onOpenFaq && (
              <button
                type="button"
                onClick={onOpenFaq}
                className="header-link"
              >
                FAQ
              </button>
            )}
            <a href="#contact" onClick={handleContactClick} className="header-link">
              Contact
            </a>
          </nav>

          <div className="header-actions">
            <div className="header-privacy-badge" title="All PDF processing stays in your browser">
              <ShieldCheck size={14} strokeWidth={1.75} className="header-shield-icon" aria-hidden="true" />
              <span>Private &amp; Local</span>
            </div>

            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                className="header-theme-btn"
                aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
            )}

            <button
              className="header-mobile-toggle"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="header-mobile-menu" role="dialog" aria-label="Mobile Navigation">
            <a href="#tools" onClick={handleToolsClick} className="header-mobile-link">
              All PDF Tools
            </a>
            <button
              type="button"
              onClick={handleAboutClick}
              className="header-mobile-link header-mobile-btn"
            >
              About
            </button>
            {onOpenFaq && (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenFaq();
                }}
                className="header-mobile-link header-mobile-btn"
              >
                FAQ
              </button>
            )}
            <button
              type="button"
              onClick={handleContactClick}
              className="header-mobile-link header-mobile-btn"
            >
              Contact
            </button>
            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                className="header-mobile-link header-mobile-btn"
              >
                {theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              </button>
            )}
            <div className="header-mobile-badge">
              <ShieldCheck size={15} className="header-shield-icon" aria-hidden="true" />
              <span>Files stay strictly in your browser</span>
            </div>
          </div>
        )}
      </header>

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
