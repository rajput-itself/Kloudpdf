import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          'pdf-engine': ['pdf-lib', '@pdfsmaller/pdf-encrypt'],
          'pdf-viewer': ['pdfjs-dist'],
          'react-vendor': ['react', 'react-dom'],
          'lucide-icons': ['lucide-react'],
          'ocr-engine': ['tesseract.js'],
          'office-word': ['docx', 'docx-preview'],
          'office-excel': ['xlsx'],
          'office-pptx': ['pptxgenjs'],
          'dom-capture': ['html2canvas', 'dompurify'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['pdf-lib', 'pdfjs-dist'],
  },
});
