import {
  PDFDocument,
  PDFDict,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFName,
} from 'pdf-lib';
import { toBlob } from '../../utils/file';

export type FormFieldType = 'text' | 'checkbox' | 'radio' | 'dropdown' | 'unsupported';

export interface DetectedFormField {
  name: string;
  type: FormFieldType;
  currentValue: string | boolean;
  options?: string[]; // For dropdown or radio
  isMultiline?: boolean;
}

export interface FormInspectionResult {
  hasForm: boolean;
  isXfa: boolean;
  fields: DetectedFormField[];
}

/**
 * Inspects a PDF document and detects all interactive AcroForm fields.
 */
export async function inspectPdfForm(file: File): Promise<FormInspectionResult> {
  const buffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });

  // Detect dynamic XFA forms
  let isXfa = false;
  try {
    const acroFormDict = pdfDoc.catalog.lookup(PDFName.of('AcroForm'));
    if (acroFormDict instanceof PDFDict && acroFormDict.has(PDFName.of('XFA'))) {
      isXfa = true;
    }
  } catch {
    // Ignore XFA check errors
  }

  const form = pdfDoc.getForm();
  const rawFields = form.getFields();

  if (rawFields.length === 0) {
    return {
      hasForm: false,
      isXfa,
      fields: [],
    };
  }

  const fields: DetectedFormField[] = [];

  for (const field of rawFields) {
    const name = field.getName();

    if (field instanceof PDFTextField) {
      fields.push({
        name,
        type: 'text',
        currentValue: field.getText() || '',
        isMultiline: field.isMultiline(),
      });
    } else if (field instanceof PDFCheckBox) {
      fields.push({
        name,
        type: 'checkbox',
        currentValue: field.isChecked(),
      });
    } else if (field instanceof PDFRadioGroup) {
      fields.push({
        name,
        type: 'radio',
        currentValue: field.getSelected() || '',
        options: field.getOptions(),
      });
    } else if (field instanceof PDFDropdown) {
      fields.push({
        name,
        type: 'dropdown',
        currentValue: field.getSelected()[0] || '',
        options: field.getOptions(),
      });
    }
  }

  return {
    hasForm: fields.length > 0,
    isXfa,
    fields,
  };
}

/**
 * Updates form field values and saves the resulting PDF document.
 * Optionally flattens the form fields to make them permanent.
 */
export async function saveFilledPdfForm(
  file: File,
  fieldValues: Record<string, string | boolean>,
  options: { flatten?: boolean } = {}
): Promise<Blob> {
  const buffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(buffer);
  const form = pdfDoc.getForm();

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
