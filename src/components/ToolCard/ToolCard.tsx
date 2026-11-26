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
  Image,
  Code,
  FileText,
  Table,
  Presentation,
  Stamp,
  Hash,
  ShieldCheck,
  FileX,
  BookOpen,
  ScanText,
  Contrast,
  Highlighter,
  Eraser,
  CheckSquare,
  Layers,
  Compass,
  FileEdit,
  Minimize2,
  FolderArchive,
  FileSpreadsheet,
  FileType,
  LucideIcon,
} from 'lucide-react';
import { ToolDefinition, ToolId } from '../../types';
import './ToolCard.css';

interface ToolCardProps {
  tool: ToolDefinition;
  onSelect: (toolId: ToolId) => void;
}

const ICON_MAP: Record<ToolId, LucideIcon> = {
  'edit-pdf': FileEdit,
  merge: Files,
  split: Scissors,
  organize: LayoutGrid,
  rotate: RotateCw,
  'remove-pages': FileMinus,
  'extract-pages': FileOutput,
  'remove-blank-pages': FileX,
  'booklet-maker': BookOpen,
  'jpg-to-pdf': FileImage,
  'webp-to-pdf': FileImage,
  'pdf-to-jpg': Images,
  'pdf-to-png': Image,
  'pdf-to-webp': FileImage,
  'pdf-to-word': FileText,
  'pdf-to-excel': FileSpreadsheet,
  'pdf-to-pptx': Presentation,
  'html-to-pdf': Code,
  'word-to-pdf': FileText,
  'excel-to-pdf': Table,
  'powerpoint-to-pdf': Presentation,
  'text-to-pdf': FileType,
  'markdown-to-pdf': Code,
  'pdf-to-text': FileText,
  'ocr-pdf': ScanText,
  'grayscale-pdf': Contrast,
  watermark: Stamp,
  'page-numbers': Hash,
  'annotate-pdf': Highlighter,
  'redact-pdf': Eraser,
  'fill-forms': CheckSquare,
  'flatten-pdf': Layers,
  'deskew-pdf': Compass,
  'compress-pdf': Minimize2,
  'batch-pdf': FolderArchive,
  protect: ShieldCheck,
};

export const ToolCard: React.FC<ToolCardProps> = ({ tool, onSelect }) => {
  const Icon = ICON_MAP[tool.id] || Files;

  return (
    <button
      className="tool-card"
      onClick={() => onSelect(tool.id)}
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
