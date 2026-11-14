import React from 'react';
import {
  Files,
  Scissors,
  LayoutGrid,
  RotateCw,
  FileMinus,
  FileOutput,
  FileImage,
  Images,
  Stamp,
  Hash,
  ShieldCheck,
  LucideIcon,
} from 'lucide-react';
import { ToolDefinition, ToolId } from '../../types';
import './ToolCard.css';

interface ToolCardProps {
  tool: ToolDefinition;
  onSelect: (toolId: ToolId) => void;
}

const ICON_MAP: Record<ToolId, LucideIcon> = {
  merge: Files,
  split: Scissors,
  organize: LayoutGrid,
  rotate: RotateCw,
  'remove-pages': FileMinus,
  'extract-pages': FileOutput,
  'jpg-to-pdf': FileImage,
  'pdf-to-jpg': Images,
  watermark: Stamp,
  'page-numbers': Hash,
  protect: ShieldCheck,
};

export const ToolCard: React.FC<ToolCardProps> = ({ tool, onSelect }) => {
  const Icon = ICON_MAP[tool.id] || Files;

  return (
    <button
      className="tool-card"
      onClick={() => onSelect(tool.id)}
      aria-label={`${tool.name}: ${tool.description}`}
    >
      <div className="tool-card-icon-wrapper">
        <Icon className="tool-card-icon" size={24} strokeWidth={1.75} />
      </div>
      <div className="tool-card-content">
        <h3 className="tool-card-title">{tool.name}</h3>
        <p className="tool-card-desc">{tool.description}</p>
      </div>
    </button>
  );
};
