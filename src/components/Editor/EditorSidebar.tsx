import React from 'react';
import { ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import './EditorSidebar.css';

interface EditorSidebarProps {
  pageCount: number;
  currentPage: number;
  onSelectPage: (pageNumber: number) => void;
  pageThumbnails: Record<number, string>; // pageNumber -> dataUrl
  pageEditsCount: Record<number, number>; // pageNumber -> count of objects
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const EditorSidebar: React.FC<EditorSidebarProps> = ({
  pageCount,
  currentPage,
  onSelectPage,
  pageThumbnails,
  pageEditsCount,
  isCollapsed,
  onToggleCollapse,
}) => {
  const pagesArray = Array.from({ length: pageCount }, (_, i) => i + 1);

  return (
    <>
      {/* Mobile Floating Trigger when collapsed on mobile */}
      {isCollapsed && (
        <button
          type="button"
          className="sidebar-mobile-trigger"
          onClick={onToggleCollapse}
          aria-label="Open page selector"
          title="Open page thumbnails"
        >
          <Layers size={15} />
          <span>{currentPage}/{pageCount}</span>
        </button>
      )}

      {/* Mobile Backdrop when drawer is open */}
      {!isCollapsed && (
        <div
          className="sidebar-mobile-backdrop"
          onClick={onToggleCollapse}
          aria-hidden="true"
        />
      )}

      <aside className={`editor-sidebar ${isCollapsed ? 'collapsed' : ''}`} aria-label="Page Thumbnails">
        {isCollapsed ? (
          <button
            type="button"
            className="sidebar-expand-btn"
            onClick={onToggleCollapse}
            title="Expand Pages Sidebar"
            aria-label="Expand Pages Sidebar"
          >
            <ChevronRight size={18} />
          </button>
        ) : (
          <>
            <div className="sidebar-header">
              <div className="sidebar-title">
                <Layers size={16} className="text-secondary" />
                <span>Pages ({pageCount})</span>
              </div>
              <button
                type="button"
                className="sidebar-collapse-btn"
                onClick={onToggleCollapse}
                title="Collapse Sidebar"
                aria-label="Collapse Sidebar"
              >
                <ChevronLeft size={16} />
              </button>
            </div>

            <div className="sidebar-thumbnails-list">
              {pagesArray.map((pageNum) => {
                const isActive = pageNum === currentPage;
                const thumbnail = pageThumbnails[pageNum];
                const edits = pageEditsCount[pageNum] || 0;

                return (
                  <div
                    key={pageNum}
                    className={`sidebar-thumb-card ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      onSelectPage(pageNum);
                      // On mobile screens, auto-close the drawer after selecting a page
                      if (window.innerWidth < 900) {
                        onToggleCollapse();
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        onSelectPage(pageNum);
                        if (window.innerWidth < 900) {
                          onToggleCollapse();
                        }
                      }
                    }}
                  >
                    <div className="thumb-preview-box">
                      {thumbnail ? (
                        <img
                          src={thumbnail}
                          alt={`Page ${pageNum}`}
                          className="thumb-image"
                          loading="lazy"
                        />
                      ) : (
                        <div className="thumb-placeholder">
                          <span>{pageNum}</span>
                        </div>
                      )}
                      {edits > 0 && (
                        <span className="thumb-edits-badge" title={`${edits} edit(s) on this page`}>
                          {edits}
                        </span>
                      )}
                    </div>
                    <span className="thumb-label">Page {pageNum}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </aside>
    </>
  );
};
