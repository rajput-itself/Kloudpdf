import React, { useRef, useState } from 'react';
import { UploadCloud, ShieldCheck, AlertCircle } from 'lucide-react';
import { ToolDefinition } from '../../types';
import { isValidFileType } from '../../utils/file';
import './FileUpload.css';

interface FileUploadProps {
  tool: ToolDefinition;
  onFilesSelected: (files: File[]) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ tool, onFilesSelected }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const processFileList = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setErrorMessage(null);

    const validFiles: File[] = [];
    const invalidNames: string[] = [];

    Array.from(fileList).forEach((file) => {
      if (isValidFileType(file, tool.acceptedFileTypes)) {
        validFiles.push(file);
      } else {
        invalidNames.push(file.name);
      }
    });

    if (invalidNames.length > 0) {
      setErrorMessage(
        `Invalid file format for: ${invalidNames.slice(0, 2).join(', ')}. Supported: ${tool.acceptedFileTypes}`
      );
    }

    if (validFiles.length > 0) {
      if (!tool.acceptMultiple && validFiles.length > 1) {
        // If single file tool, take the first valid one
        onFilesSelected([validFiles[0]!]);
      } else {
        onFilesSelected(validFiles);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    processFileList(e.dataTransfer.files);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFileList(e.target.files);
    // Reset input value so same file can be selected again if needed
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="file-upload-wrapper">
      <div
        className={`file-upload-dropzone ${isDragOver ? 'drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleButtonClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleButtonClick();
          }
        }}
        aria-label="Upload files"
      >
        <input
          ref={fileInputRef}
          type="file"
          className="file-upload-input"
          accept={tool.acceptedFileTypes}
          multiple={tool.acceptMultiple}
          onChange={handleInputChange}
          tabIndex={-1}
        />

        <div className="upload-icon-circle">
          <UploadCloud size={32} />
        </div>

        <div className="upload-prompt">
          <p className="upload-prompt-primary">
            Drag & drop your {tool.acceptMultiple ? 'files' : 'file'} here, or{' '}
            <span className="upload-prompt-browse">browse</span>
          </p>
          <p className="upload-prompt-hint">
            Supported format: {tool.acceptedFileTypes.replace(/,/g, ', ')}
            {tool.acceptMultiple && ' • Multiple files supported'}
          </p>
        </div>

        <button
          type="button"
          className="btn btn-primary btn-md upload-select-btn"
          onClick={(e) => {
            e.stopPropagation();
            handleButtonClick();
          }}
        >
          Select {tool.acceptMultiple ? 'Files' : 'File'}
        </button>

        <div className="upload-privacy-note">
          <ShieldCheck size={14} className="privacy-shield-icon" />
          <span>Files stay strictly on your device. Never uploaded to any server.</span>
        </div>
      </div>

      {errorMessage && (
        <div className="upload-error-alert" role="alert">
          <AlertCircle size={16} />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
};
