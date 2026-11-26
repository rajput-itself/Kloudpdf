import React, { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import { ToolCard } from '../../components/ToolCard/ToolCard';
import { PrivacySection } from '../../components/PrivacySection/PrivacySection';
import { CATEGORIES, TOOLS } from '../../config/tools';
import { ToolCategory, ToolId } from '../../types';
import './HomePage.css';

interface HomePageProps {
  onSelectTool: (toolId: ToolId) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onSelectTool }) => {
  const [selectedCategory, setSelectedCategory] = useState<ToolCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
        setSearchQuery('');
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const filteredTools = TOOLS.filter((tool) => {
    const matchesCategory =
      selectedCategory === 'all' || tool.category === selectedCategory;
    const matchesSearch =
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const isUnfilteredAll = selectedCategory === 'all' && !searchQuery.trim();

  return (
    <div className="home-page">
      {/* Calm Centered Editorial Hero */}
      <section className="hero-section">
        <div className="container hero-container">
          <h1 className="hero-heading">Every PDF tool, private by default</h1>
          <p className="hero-subheading">
            Edit, compress, merge, convert, and OCR PDFs locally in your browser
          </p>

          <div className="hero-search-wrapper">
            <div className="hero-search-box">
              <Search size={17} strokeWidth={1.6} className="search-icon" aria-hidden="true" />
              <input
                ref={searchInputRef}
                type="text"
                className="hero-search-input"
                placeholder="Search tools"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search PDF tools"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                >
                  &times;
                </button>
              )}
            </div>
          </div>

          {/* Integrated Category Tabs */}
          <div className="category-filter-bar" role="tablist" aria-label="Filter tools by category">
            <button
              type="button"
              role="tab"
              aria-selected={selectedCategory === 'all'}
              className={`category-tab ${selectedCategory === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('all')}
            >
              All Tools <span className="category-tab-count tabular-nums">{TOOLS.length}</span>
            </button>
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={selectedCategory === cat.id}
                className={`category-tab ${selectedCategory === cat.id ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat.id)}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Main Tool Directory */}
      <section id="tools-section" className="tools-section">
        <div className="container">
          {isUnfilteredAll ? (
            <div className="category-groups">
              {CATEGORIES.map((category) => {
                const categoryTools = TOOLS.filter((t) => t.category === category.id);
                return (
                  <div key={category.id} className="category-group">
                    <div className="category-group-header">
                      <h2 className="category-group-title">{category.name}</h2>
                      <p className="category-group-desc">{category.description}</p>
                    </div>
                    <div className="tools-card-grid">
                      {categoryTools.map((tool) => (
                        <ToolCard key={tool.id} tool={tool} onSelect={onSelectTool} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="filtered-results">
              {filteredTools.length > 0 ? (
                <div className="tools-card-grid">
                  {filteredTools.map((tool) => (
                    <ToolCard key={tool.id} tool={tool} onSelect={onSelectTool} />
                  ))}
                </div>
              ) : (
                <div className="empty-search">
                  <p>No tools matched "{searchQuery}".</p>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategory('all');
                    }}
                  >
                    Show All Tools
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <PrivacySection />
    </div>
  );
};
