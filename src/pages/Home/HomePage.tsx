import React, { useState } from 'react';
import { ToolCard } from '../../components/ToolCard/ToolCard';
import { PrivacySection } from '../../components/PrivacySection/PrivacySection';
import { CATEGORIES, TOOLS } from '../../config/tools';
import { ToolCategory, ToolId } from '../../types';
import { Search } from 'lucide-react';
import './HomePage.css';

interface HomePageProps {
  onSelectTool: (toolId: ToolId) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onSelectTool }) => {
  const [selectedCategory, setSelectedCategory] = useState<ToolCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTools = TOOLS.filter((tool) => {
    const matchesCategory =
      selectedCategory === 'all' || tool.category === selectedCategory;
    const matchesSearch =
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="home-page">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="container hero-container">
          <h1 className="hero-heading">Everything you need to work with PDFs.</h1>
          <p className="hero-subheading">
            A simple and reliable set of tools to organize, convert, edit and protect your PDF files.
          </p>

          {/* Quick Search */}
          <div className="hero-search-wrapper">
            <div className="hero-search-box">
              <Search size={18} className="search-icon" />
              <input
                type="text"
                className="hero-search-input"
                placeholder="Search tools (e.g., merge, split, watermark, protect)..."
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
        </div>
      </section>

      {/* Tools Section */}
      <section id="tools-section" className="tools-section">
        <div className="container">
          {/* Category Filter Tabs */}
          <div className="category-filter-bar">
            <button
              className={`category-tab ${selectedCategory === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('all')}
            >
              All Tools ({TOOLS.length})
            </button>
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                className={`category-tab ${selectedCategory === cat.id ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat.id)}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Tool Groups or Filtered Grid */}
          {selectedCategory === 'all' && !searchQuery ? (
            <div className="category-groups">
              {CATEGORIES.map((category) => {
                const categoryTools = TOOLS.filter((t) => t.category === category.id);
                return (
                  <div key={category.id} className="category-group">
                    <div className="category-group-header">
                      <h2 className="category-group-title">{category.name}</h2>
                      <p className="category-group-desc">{category.description}</p>
                    </div>
                    <div className="tools-grid">
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
                <div className="tools-grid">
                  {filteredTools.map((tool) => (
                    <ToolCard key={tool.id} tool={tool} onSelect={onSelectTool} />
                  ))}
                </div>
              ) : (
                <div className="empty-search">
                  <p>No tools matched "{searchQuery}".</p>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategory('all');
                    }}
                  >
                    View All Tools
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Privacy Section */}
      <PrivacySection />
    </div>
  );
};
