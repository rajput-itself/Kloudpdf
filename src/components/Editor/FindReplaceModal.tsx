import React, { useState, useEffect } from 'react';
import { Search, Replace, ChevronUp, ChevronDown, X, Check } from 'lucide-react';
import { Button } from '../common/Button/Button';
import './FindReplaceModal.css';

interface FindReplaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFind: (query: string, caseSensitive: boolean) => number; // returns match count
  onReplaceNext: (query: string, replacement: string, caseSensitive: boolean) => void;
  onReplaceAll: (query: string, replacement: string, caseSensitive: boolean) => number;
  matchCount: number;
  currentMatchIndex: number;
  onNextMatch: () => void;
  onPrevMatch: () => void;
}

export const FindReplaceModal: React.FC<FindReplaceModalProps> = ({
  isOpen,
  onClose,
  onFind,
  onReplaceNext,
  onReplaceAll,
  matchCount,
  currentMatchIndex,
  onNextMatch,
  onPrevMatch,
}) => {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim()) {
      const count = onFind(query, caseSensitive);
      if (count === 0) {
        setFeedback('No matches found');
      } else {
        setFeedback(null);
      }
    } else {
      setFeedback(null);
    }
  }, [query, caseSensitive, onFind]);

  if (!isOpen) return null;

  const handleReplaceCurrent = () => {
    if (!query.trim()) return;
    onReplaceNext(query, replacement, caseSensitive);
    setFeedback('Replaced current occurrence');
  };

  const handleReplaceAllClick = () => {
    if (!query.trim()) return;
    const count = onReplaceAll(query, replacement, caseSensitive);
    setFeedback(`Replaced ${count} occurrence${count === 1 ? '' : 's'}`);
  };

  return (
    <div className="find-replace-floating-card" role="dialog" aria-label="Find and Replace">
      <div className="find-replace-header">
        <div className="find-replace-title">
          <Search size={15} className="text-primary" />
          <span>Find & Replace in Document</span>
        </div>
        <button
          type="button"
          className="find-replace-close-btn"
          onClick={onClose}
          aria-label="Close find and replace"
        >
          <X size={15} />
        </button>
      </div>

      <div className="find-replace-body">
        {/* Find Input */}
        <div className="find-replace-row">
          <div className="find-input-wrapper">
            <input
              type="text"
              className="find-input"
              placeholder="Find text..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            {query && (
              <span className="match-counter-pill">
                {matchCount > 0 ? `${currentMatchIndex + 1} of ${matchCount}` : '0 results'}
              </span>
            )}
          </div>
          <div className="find-nav-buttons">
            <button
              type="button"
              className="find-nav-btn"
              onClick={onPrevMatch}
              disabled={matchCount === 0}
              title="Previous match"
            >
              <ChevronUp size={14} />
            </button>
            <button
              type="button"
              className="find-nav-btn"
              onClick={onNextMatch}
              disabled={matchCount === 0}
              title="Next match"
            >
              <ChevronDown size={14} />
            </button>
          </div>
        </div>

        {/* Replace Input */}
        <div className="find-replace-row">
          <input
            type="text"
            className="find-input"
            placeholder="Replace with..."
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
          />
        </div>

        {/* Options */}
        <div className="find-options-row">
          <label className="find-checkbox-label">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive(e.target.checked)}
            />
            <span>Match case</span>
          </label>
          {feedback && <span className="find-feedback-text">{feedback}</span>}
        </div>

        {/* Actions */}
        <div className="find-actions-row">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleReplaceCurrent}
            disabled={matchCount === 0}
            icon={<Replace size={13} />}
          >
            Replace
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleReplaceAllClick}
            disabled={matchCount === 0}
            icon={<Check size={13} />}
          >
            Replace All
          </Button>
        </div>
      </div>
    </div>
  );
};
