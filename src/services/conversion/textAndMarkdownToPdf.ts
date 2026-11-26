/**
 * KloudPDF — Client-Side Plain Text & Markdown to Vector PDF Converter
 * Uses pdf-lib standard fonts to create lightweight, crisp, 100% searchable vector PDFs.
 */

import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib';
import { toBlob } from '../../utils/file';

export interface TextToPdfOptions {
  pageSize?: 'a4' | 'letter';
  fontSize?: number;
  margin?: number;
  isMarkdown?: boolean;
}

interface ParsedBlock {
  kind: 'h1' | 'h2' | 'h3' | 'code' | 'quote' | 'list' | 'hr' | 'paragraph';
  text: string;
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');
}

function parseMarkdownBlocks(raw: string): ParsedBlock[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const blocks: ParsedBlock[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) {
      blocks.push({ kind: 'code', text: line });
      continue;
    }
    if (!trimmed) {
      blocks.push({ kind: 'paragraph', text: '' });
      continue;
    }
    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      blocks.push({ kind: 'hr', text: '' });
    } else if (trimmed.startsWith('### ')) {
      blocks.push({ kind: 'h3', text: stripInlineMarkdown(trimmed.slice(4)) });
    } else if (trimmed.startsWith('## ')) {
      blocks.push({ kind: 'h2', text: stripInlineMarkdown(trimmed.slice(3)) });
    } else if (trimmed.startsWith('# ')) {
      blocks.push({ kind: 'h1', text: stripInlineMarkdown(trimmed.slice(2)) });
    } else if (trimmed.startsWith('> ')) {
      blocks.push({ kind: 'quote', text: stripInlineMarkdown(trimmed.slice(2)) });
    } else if (/^[-*+]\s+/.test(trimmed)) {
      blocks.push({ kind: 'list', text: `•  ${stripInlineMarkdown(trimmed.replace(/^[-*+]\s+/, ''))}` });
    } else if (/^\d+\.\s+/.test(trimmed)) {
      blocks.push({ kind: 'list', text: stripInlineMarkdown(trimmed) });
    } else {
      blocks.push({ kind: 'paragraph', text: stripInlineMarkdown(line) });
    }
  }
  return blocks;
}

function wrapTextLines(
  text: string,
  font: any,
  fontSize: number,
  maxWidth: number
): string[] {
  if (!text) return [''];
  // Normalize non-WinAnsi glyphs safely so pdf-lib standard fonts never throw encoding errors
  const safeText = text.replace(/[^\x20-\x7E\xA0-\xFF]/g, (ch) => (ch === '•' ? '-' : '?'));
  const words = safeText.split(/\s+/);
  const wrapped: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate;
    } else {
      if (current) wrapped.push(current);
      current = word;
    }
  }
  if (current) wrapped.push(current);
  return wrapped.length > 0 ? wrapped : [''];
}

export async function convertTextOrMarkdownToPdf(
  input: File | string,
  options: TextToPdfOptions = {}
): Promise<Blob> {
  const rawText = typeof input === 'string' ? input : await input.text();
  if (!rawText.trim()) {
    throw new Error('Input text is empty.');
  }

  const isMarkdown =
    options.isMarkdown ??
    (typeof input !== 'string' && input.name.toLowerCase().endsWith('.md'));

  const [pageWidth, pageHeight] =
    options.pageSize === 'letter' ? PageSizes.Letter : PageSizes.A4;
  const margin = options.margin ?? 50;
  const baseFontSize = options.fontSize ?? 11;
  const usableWidth = pageWidth - margin * 2;

  const pdfDoc = await PDFDocument.create();
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const monoFont = await pdfDoc.embedFont(StandardFonts.Courier);

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let cursorY = pageHeight - margin;

  const ensureSpace = (needed: number) => {
    if (cursorY - needed < margin) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      cursorY = pageHeight - margin;
    }
  };

  const blocks: ParsedBlock[] = isMarkdown
    ? parseMarkdownBlocks(rawText)
    : rawText.replace(/\r\n/g, '\n').split('\n').map((line) => ({ kind: 'paragraph', text: line }));

  for (const block of blocks) {
    if (block.kind === 'hr') {
      ensureSpace(20);
      cursorY -= 6;
      page.drawLine({
        start: { x: margin, y: cursorY },
        end: { x: pageWidth - margin, y: cursorY },
        thickness: 0.75,
        color: rgb(0.82, 0.84, 0.86),
      });
      cursorY -= 12;
      continue;
    }

    if (!block.text) {
      cursorY -= baseFontSize * 0.75;
      continue;
    }

    let font = regularFont;
    let size = baseFontSize;
    let color = rgb(0.13, 0.14, 0.15);
    let xOffset = 0;

    if (block.kind === 'h1') {
      font = boldFont;
      size = baseFontSize + 9;
      cursorY -= 6;
    } else if (block.kind === 'h2') {
      font = boldFont;
      size = baseFontSize + 5;
      cursorY -= 4;
    } else if (block.kind === 'h3') {
      font = boldFont;
      size = baseFontSize + 2;
      cursorY -= 2;
    } else if (block.kind === 'code') {
      font = monoFont;
      size = Math.max(9, baseFontSize - 1);
      color = rgb(0.15, 0.25, 0.45);
      xOffset = 10;
    } else if (block.kind === 'quote') {
      font = italicFont;
      color = rgb(0.37, 0.39, 0.41);
      xOffset = 14;
    } else if (block.kind === 'list') {
      xOffset = 10;
    }

    const lineHeight = size * 1.45;
    const lines = wrapTextLines(block.text, font, size, usableWidth - xOffset);

    for (const line of lines) {
      ensureSpace(lineHeight);
      if (block.kind === 'quote') {
        page.drawLine({
          start: { x: margin + 4, y: cursorY + size * 0.8 },
          end: { x: margin + 4, y: cursorY - 2 },
          thickness: 2,
          color: rgb(0.1, 0.45, 0.91),
        });
      }
      page.drawText(line, {
        x: margin + xOffset,
        y: cursorY,
        size,
        font,
        color,
      });
      cursorY -= lineHeight;
    }

    if (block.kind === 'h1' || block.kind === 'h2') {
      cursorY -= 4;
    }
  }

  const pdfBytes = await pdfDoc.save();
  return toBlob(pdfBytes, 'application/pdf');
}
