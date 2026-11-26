import {
  PDFDocument,
  PDFDict,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
  PDFName,
} from 'pdf-lib';
import { toBlob } from '../../utils/file';

export type FormFieldType = 'text' | 'checkbox' | 'radio' | 'dropdown' | 'unsupported';

export interface DetectedFormField {
  name: string;
  type: FormFieldType;
  currentValue: string | boolean;
  options?: string[]; // For dropdown, radio, or listbox
  isMultiline?: boolean;
  isReadOnly?: boolean;
  isRequired?: boolean;
  pageNumber?: number; // 1-indexed
}

export interface FormInspectionResult {
  hasForm: boolean;
  isXfa: boolean;
  fields: DetectedFormField[];
  fieldCount: number;
  totalPageCount: number;
}

/**
 * Inspects a PDF document and detects all interactive AcroForm fields,
 * their current values, choices, constraints, and page locations.
 */
export async function inspectPdfForm(
  source: File | ArrayBuffer | Uint8Array
): Promise<FormInspectionResult> {
  let bytes: Uint8Array;
  if (source instanceof File) {
    bytes = new Uint8Array(await source.arrayBuffer());
  } else if (source instanceof Uint8Array) {
    bytes = new Uint8Array(source.slice());
  } else {
    bytes = new Uint8Array(source.slice(0));
  }
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const totalPageCount = pdfDoc.getPageCount();

  // Detect dynamic XFA forms (unsupported by standard AcroForm processors)
  let isXfa = false;
  try {
    const acroFormDict = pdfDoc.catalog.lookup(PDFName.of('AcroForm'));
    if (acroFormDict instanceof PDFDict && acroFormDict.has(PDFName.of('XFA'))) {
      isXfa = true;
    }
  } catch {
    // Ignore XFA check error
  }

  let form;
  try {
    form = pdfDoc.getForm();
  } catch {
    return {
      hasForm: false,
      isXfa,
      fields: [],
      fieldCount: 0,
      totalPageCount,
    };
  }

  const rawFields = form.getFields();

  if (rawFields.length === 0) {
    return {
      hasForm: false,
      isXfa,
      fields: [],
      fieldCount: 0,
      totalPageCount,
    };
  }

  const pages = pdfDoc.getPages();
  const fields: DetectedFormField[] = [];

  for (const field of rawFields) {
    const name = field.getName();
    let isReadOnly = false;
    let isRequired = false;

    try {
      isReadOnly = field.isReadOnly();
      isRequired = field.isRequired();
    } catch {
      // Ignore
    }

    // Determine field page location
    let pageNumber = 1;
    try {
      const widgets = (field as any).acroField?.getWidgets?.();
      if (widgets && widgets.length > 0 && widgets[0]) {
        const pageRef = widgets[0].P();
        if (pageRef) {
          for (let pIdx = 0; pIdx < pages.length; pIdx++) {
            if (pages[pIdx]?.ref === pageRef) {
              pageNumber = pIdx + 1;
              break;
            }
          }
        }
      }
    } catch {
      pageNumber = 1;
    }

    if (field instanceof PDFTextField) {
      fields.push({
        name,
        type: 'text',
        currentValue: field.getText() || '',
        isMultiline: field.isMultiline(),
        isReadOnly,
        isRequired,
        pageNumber,
      });
    } else if (field instanceof PDFCheckBox) {
      fields.push({
        name,
        type: 'checkbox',
        currentValue: field.isChecked(),
        isReadOnly,
        isRequired,
        pageNumber,
      });
    } else if (field instanceof PDFRadioGroup) {
      fields.push({
        name,
        type: 'radio',
        currentValue: field.getSelected() || '',
        options: field.getOptions(),
        isReadOnly,
        isRequired,
        pageNumber,
      });
    } else if (field instanceof PDFDropdown) {
      fields.push({
        name,
        type: 'dropdown',
        currentValue: field.getSelected()[0] || '',
        options: field.getOptions(),
        isReadOnly,
        isRequired,
        pageNumber,
      });
    } else if (field instanceof PDFOptionList) {
      fields.push({
        name,
        type: 'dropdown',
        currentValue: field.getSelected()[0] || '',
        options: field.getOptions(),
        isReadOnly,
        isRequired,
        pageNumber,
      });
    }
  }

  return {
    hasForm: fields.length > 0,
    isXfa,
    fields,
    fieldCount: fields.length,
    totalPageCount,
  };
}

/**
 * Updates form field values and saves the resulting PDF document.
 * Optionally flattens the form fields to make them permanent static artwork.
 */
export async function saveFilledPdfForm(
  source: File | ArrayBuffer | Uint8Array,
  fieldValues: Record<string, string | boolean>,
  options: { flatten?: boolean; clearAll?: boolean } = {}
): Promise<Blob> {
  let bytes: Uint8Array;
  if (source instanceof File) {
    bytes = new Uint8Array(await source.arrayBuffer());
  } else if (source instanceof Uint8Array) {
    bytes = new Uint8Array(source.slice());
  } else {
    bytes = new Uint8Array(source.slice(0));
  }
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();

  if (options.clearAll) {
    const rawFields = form.getFields();
    for (const f of rawFields) {
      try {
        if (f instanceof PDFTextField) f.setText('');
        else if (f instanceof PDFCheckBox) f.uncheck();
        else if (f instanceof PDFRadioGroup) {
          const opts = f.getOptions();
          if (opts.length > 0) f.select(opts[0] || '');
        }
      } catch {
        // Ignore
      }
    }
  }

  for (const [name, val] of Object.entries(fieldValues)) {
    try {
      const field = form.getField(name);

      if (field instanceof PDFTextField && typeof val === 'string') {
        field.setText(val);
      } else if (field instanceof PDFCheckBox && typeof val === 'boolean') {
        if (val) field.check();
        else field.uncheck();
      } else if (field instanceof PDFRadioGroup && typeof val === 'string') {
        if (val) field.select(val);
      } else if (field instanceof PDFDropdown && typeof val === 'string') {
        if (val) field.select(val);
      } else if (field instanceof PDFOptionList && typeof val === 'string') {
        if (val) field.select(val);
      }
    } catch (err) {
      console.warn(`Could not set form field "${name}":`, err);
    }
  }

  if (options.flatten) {
    form.flatten();
  }

  const pdfBytes = await pdfDoc.save();
  return toBlob(pdfBytes, 'application/pdf');
}
