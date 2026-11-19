import React, { useRef, useState, useEffect } from 'react';
import { X, RotateCcw, Upload, Edit3, Check } from 'lucide-react';
import { Button } from '../common/Button/Button';
import './SignatureModal.css';

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (dataUrl: string, width: number, height: number) => void;
}

export const SignatureModal: React.FC<SignatureModalProps> = ({
  isOpen,
  onClose,
  onInsert,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [activeTab, setActiveTab] = useState<'draw' | 'upload'>('draw');
  const [strokeColor, setStrokeColor] = useState<string>('#1a73e8');
  const [uploadedDataUrl, setUploadedDataUrl] = useState<string | null>(null);
  const [uploadDimensions, setUploadDimensions] = useState<{ width: number; height: number }>({
    width: 180,
    height: 70,
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Setup canvas
  useEffect(() => {
    if (!isOpen || activeTab !== 'draw') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Retina display scaling
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const url = loadEvent.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const aspect = img.width / img.height;
        const targetW = 180;
        const targetH = targetW / aspect;
        setUploadDimensions({ width: targetW, height: targetH });
        setUploadedDataUrl(url);
      };
      img.src = url;
    };
    reader.readAsDataURL(file);
  };

  const handleConfirm = () => {
    if (activeTab === 'draw') {
      const canvas = canvasRef.current;
      if (!canvas || !hasDrawn) return;
      const dataUrl = canvas.toDataURL('image/png');
      onInsert(dataUrl, 180, 70);
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
            <span>Insert Signature</span>
          </div>
          <button className="sig-close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
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
            className={`sig-tab ${activeTab === 'upload' ? 'active' : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            <Upload size={14} />
            <span>Upload Image</span>
          </button>
        </div>

        <div className="sig-modal-body">
          {activeTab === 'draw' ? (
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
                    <span>Sign your name here with mouse or touch</span>
                  </div>
                )}
              </div>

              {/* Controls bar below canvas */}
              <div className="sig-controls-bar">
                <div className="sig-color-options">
                  <span className="sig-label">Ink:</span>
                  {[
                    { color: '#1a73e8', name: 'Blue' },
                    { color: '#202124', name: 'Black' },
                    { color: '#0d47a1', name: 'Navy' },
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
          ) : (
            <div className="sig-upload-pane">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />
              {uploadedDataUrl ? (
                <div className="sig-upload-preview">
                  <img src={uploadedDataUrl} alt="Signature Preview" />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Change Image
                  </Button>
                </div>
              ) : (
                <div
                  className="sig-dropzone"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={28} className="text-secondary" />
                  <p className="sig-dropzone-text">Click to choose a PNG or JPG signature image</p>
                  <span className="sig-dropzone-sub">Transparent PNG recommended</span>
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
            disabled={activeTab === 'draw' ? !hasDrawn : !uploadedDataUrl}
            icon={<Check size={16} />}
          >
            Insert Signature
          </Button>
        </div>
      </div>
    </div>
  );
};
