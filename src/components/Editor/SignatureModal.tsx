import React, { useRef, useState, useEffect } from 'react';
import {
  X,
  RotateCcw,
  Upload,
  Edit3,
  Check,
  Type,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Button } from '../common/Button/Button';
import './SignatureModal.css';

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (dataUrl: string, width: number, height: number) => void;
}

type SigTab = 'draw' | 'type' | 'upload';

interface FontPreset {
  id: string;
  name: string;
  fontFamily: string;
}

const FONT_PRESETS: FontPreset[] = [
  { id: 'script', name: 'Elegant Script', fontFamily: "'Dancing Script', 'Brush Script MT', cursive" },
  { id: 'casual', name: 'Casual Hand', fontFamily: "'Caveat', 'Segoe Print', cursive" },
  { id: 'classic', name: 'Classic Calligraphy', fontFamily: "'Great Vibes', 'Lucida Calligraphy', cursive" },
  { id: 'formal', name: 'Formal Cursive', fontFamily: "'Snell Roundhand', 'Apple Chancery', cursive" },
];

export const SignatureModal: React.FC<SignatureModalProps> = ({
  isOpen,
  onClose,
  onInsert,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [activeTab, setActiveTab] = useState<SigTab>('draw');
  const [strokeColor, setStrokeColor] = useState<string>('#1a73e8');

  // Draw state
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Type state
  const [typedName, setTypedName] = useState<string>('');
  const [selectedFont, setSelectedFont] = useState<string>(FONT_PRESETS[0]!.fontFamily);

  // Upload state
  const [uploadedDataUrl, setUploadedDataUrl] = useState<string | null>(null);
  const [rawUploadUrl, setRawUploadUrl] = useState<string | null>(null);
  const [removeBg, setRemoveBg] = useState<boolean>(true);
  const [uploadDimensions, setUploadDimensions] = useState<{ width: number; height: number }>({
    width: 180,
    height: 70,
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Setup drawing canvas
  useEffect(() => {
    if (!isOpen || activeTab !== 'draw') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = strokeColor;
  }, [isOpen, activeTab, strokeColor]);

  if (!isOpen) return null;

  // Drawing Handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    setHasDrawn(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0]!.clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0]!.clientY : e.clientY;

    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0]!.clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0]!.clientY : e.clientY;

    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  // Upload Background Removal Processor
  const processImageTransparency = (img: HTMLImageElement, shouldRemoveWhite: boolean): string => {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return img.src;

    ctx.drawImage(img, 0, 0);

    if (shouldRemoveWhite) {
      try {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i]!;
          const g = d[i + 1]!;
          const b = d[i + 2]!;
          // If pixel is near white/light gray background, set alpha to 0
          if (r > 205 && g > 205 && b > 205) {
            d[i + 3] = 0;
          }
        }
        ctx.putImageData(imgData, 0, 0);
      } catch {
        // Fallback
      }
    }

    return canvas.toDataURL('image/png');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const url = loadEvent.target?.result as string;
      setRawUploadUrl(url);

      const img = new Image();
      img.onload = () => {
        const aspect = img.width / img.height;
        const targetW = 180;
        const targetH = targetW / aspect;
        setUploadDimensions({ width: targetW, height: targetH });
        const processedUrl = processImageTransparency(img, removeBg);
        setUploadedDataUrl(processedUrl);
      };
      img.src = url;
    };
    reader.readAsDataURL(file);
  };

  const handleToggleRemoveBg = (checked: boolean) => {
    setRemoveBg(checked);
    if (!rawUploadUrl) return;

    const img = new Image();
    img.onload = () => {
      const processedUrl = processImageTransparency(img, checked);
      setUploadedDataUrl(processedUrl);
    };
    img.src = rawUploadUrl;
  };

  // Type Signature Generator
  const generateTypedSignatureDataUrl = (): string => {
    const canvas = document.createElement('canvas');
    canvas.width = 440;
    canvas.height = 140;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `italic 44px ${selectedFont}`;
    ctx.fillStyle = strokeColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(typedName.trim(), canvas.width / 2, canvas.height / 2);

    return canvas.toDataURL('image/png');
  };

  const handleConfirm = () => {
    if (activeTab === 'draw') {
      const canvas = canvasRef.current;
      if (!canvas || !hasDrawn) return;
      const dataUrl = canvas.toDataURL('image/png');
      onInsert(dataUrl, 180, 70);
      onClose();
    } else if (activeTab === 'type') {
      if (!typedName.trim()) return;
      const dataUrl = generateTypedSignatureDataUrl();
      onInsert(dataUrl, 180, 60);
      onClose();
    } else {
      if (!uploadedDataUrl) return;
      onInsert(uploadedDataUrl, uploadDimensions.width, uploadDimensions.height);
      onClose();
    }
  };

  return (
    <div className="sig-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="sig-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="sig-modal-header">
          <div className="sig-modal-title">
            <Edit3 size={18} className="text-primary" />
            <span>Insert Visual Signature</span>
          </div>
          <button className="sig-close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Legal & Compliance Notice */}
        <div className="sig-legal-notice">
          <ShieldCheck size={14} className="text-primary" />
          <span>
            <strong>Visual Electronic Signature:</strong> For visual placement on document. This is not a cryptographic certificate-based signature.
          </span>
        </div>

        {/* Tab switcher */}
        <div className="sig-tabs">
          <button
            type="button"
            className={`sig-tab ${activeTab === 'draw' ? 'active' : ''}`}
            onClick={() => setActiveTab('draw')}
          >
            <Edit3 size={14} />
            <span>Draw</span>
          </button>
          <button
            type="button"
            className={`sig-tab ${activeTab === 'type' ? 'active' : ''}`}
            onClick={() => setActiveTab('type')}
          >
            <Type size={14} />
            <span>Type</span>
          </button>
          <button
            type="button"
            className={`sig-tab ${activeTab === 'upload' ? 'active' : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            <Upload size={14} />
            <span>Upload Image</span>
          </button>
        </div>

        <div className="sig-modal-body">
          {/* 1. DRAW TAB */}
          {activeTab === 'draw' && (
            <div className="sig-draw-pane">
              <div className="sig-canvas-wrapper">
                <canvas
                  ref={canvasRef}
                  className="sig-canvas"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />
                {!hasDrawn && (
                  <div className="sig-canvas-placeholder">
                    <span>Sign your name here with mouse, stylus, or touch</span>
                  </div>
                )}
              </div>

              <div className="sig-controls-bar">
                <div className="sig-color-options">
                  <span className="sig-label">Ink Color:</span>
                  {[
                    { color: '#1a73e8', name: 'Classic Blue' },
                    { color: '#202124', name: 'Black' },
                    { color: '#0f172a', name: 'Deep Navy' },
                  ].map((item) => (
                    <button
                      key={item.color}
                      type="button"
                      className={`sig-color-dot ${strokeColor === item.color ? 'selected' : ''}`}
                      style={{ backgroundColor: item.color }}
                      onClick={() => setStrokeColor(item.color)}
                      title={item.name}
                    />
                  ))}
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearCanvas}
                  disabled={!hasDrawn}
                  icon={<RotateCcw size={14} />}
                >
                  Clear
                </Button>
              </div>
            </div>
          )}

          {/* 2. TYPE TAB */}
          {activeTab === 'type' && (
            <div className="sig-type-pane">
              <div className="sig-type-input-group">
                <label className="sig-type-label">Type your name or initials:</label>
                <input
                  type="text"
                  className="sig-type-input"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  placeholder="e.g. Johnathan Doe"
                  autoFocus
                />
              </div>

              <div className="sig-font-selection">
                <span className="sig-label">Choose Signature Style:</span>
                <div className="sig-font-list">
                  {FONT_PRESETS.map((p) => {
                    const isSelected = selectedFont === p.fontFamily;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`sig-font-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => setSelectedFont(p.fontFamily)}
                      >
                        <span className="sig-font-meta">{p.name}</span>
                        <span
                          className="sig-font-sample"
                          style={{ fontFamily: p.fontFamily, color: strokeColor }}
                        >
                          {typedName.trim() || 'Your Signature'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="sig-controls-bar">
                <div className="sig-color-options">
                  <span className="sig-label">Ink Color:</span>
                  {[
                    { color: '#1a73e8', name: 'Classic Blue' },
                    { color: '#202124', name: 'Black' },
                    { color: '#0f172a', name: 'Deep Navy' },
                  ].map((item) => (
                    <button
                      key={item.color}
                      type="button"
                      className={`sig-color-dot ${strokeColor === item.color ? 'selected' : ''}`}
                      style={{ backgroundColor: item.color }}
                      onClick={() => setStrokeColor(item.color)}
                      title={item.name}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 3. UPLOAD TAB */}
          {activeTab === 'upload' && (
            <div className="sig-upload-pane">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />
              {uploadedDataUrl ? (
                <div className="sig-upload-preview-area">
                  <div className="sig-upload-image-box">
                    <img src={uploadedDataUrl} alt="Signature Preview" />
                  </div>

                  <div className="sig-upload-options">
                    <label className="sig-checkbox-label">
                      <input
                        type="checkbox"
                        checked={removeBg}
                        onChange={(e) => handleToggleRemoveBg(e.target.checked)}
                      />
                      <Sparkles size={14} className="text-primary" />
                      <span>Transparent Paper Background (Remove white)</span>
                    </label>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Change Image
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="sig-dropzone" onClick={() => fileInputRef.current?.click()}>
                  <Upload size={28} className="text-secondary" />
                  <p className="sig-dropzone-text">Click to choose a PNG, JPG, or WebP signature</p>
                  <span className="sig-dropzone-sub">
                    Paper scans automatically converted to transparent background
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="sig-modal-footer">
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleConfirm}
            disabled={
              activeTab === 'draw'
                ? !hasDrawn
                : activeTab === 'type'
                ? !typedName.trim()
                : !uploadedDataUrl
            }
            icon={<Check size={16} />}
          >
            Insert Signature
          </Button>
        </div>
      </div>
    </div>
  );
};
