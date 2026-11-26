import { ContentEditState, EditorObject, ExistingImageItem, ExistingTextItem } from '../types/editor';

export interface EditorDocumentState {
  objects: EditorObject[];
  contentEdits: ContentEditState;
}

/**
 * Compact Command / Delta Undo entry: stores only modified/added/removed records
 * instead of retaining full duplicate document state arrays on every edit.
 */
export interface EditorDeltaCommand {
  objectsChanged: boolean;
  prevObjects?: EditorObject[];
  nextObjects?: EditorObject[];
  textDiffs: Array<{ id: string; prev?: ExistingTextItem; next?: ExistingTextItem }>;
  imageDiffs: Array<{ id: string; prev?: ExistingImageItem; next?: ExistingImageItem }>;
}

export function createDeltaCommand(
  prev: EditorDocumentState,
  next: EditorDocumentState
): EditorDeltaCommand | null {
  const objectsChanged = prev.objects !== next.objects;
  const textDiffs: EditorDeltaCommand['textDiffs'] = [];
  const imageDiffs: EditorDeltaCommand['imageDiffs'] = [];

  const textKeys = new Set([
    ...Object.keys(prev.contentEdits.modifiedTexts),
    ...Object.keys(next.contentEdits.modifiedTexts),
  ]);
  for (const id of textKeys) {
    const p = prev.contentEdits.modifiedTexts[id];
    const n = next.contentEdits.modifiedTexts[id];
    if (p !== n) {
      textDiffs.push({ id, prev: p, next: n });
    }
  }

  const imageKeys = new Set([
    ...Object.keys(prev.contentEdits.modifiedImages),
    ...Object.keys(next.contentEdits.modifiedImages),
  ]);
  for (const id of imageKeys) {
    const p = prev.contentEdits.modifiedImages[id];
    const n = next.contentEdits.modifiedImages[id];
    if (p !== n) {
      imageDiffs.push({ id, prev: p, next: n });
    }
  }

  if (!objectsChanged && textDiffs.length === 0 && imageDiffs.length === 0) {
    return null;
  }

  return {
    objectsChanged,
    prevObjects: objectsChanged ? prev.objects : undefined,
    nextObjects: objectsChanged ? next.objects : undefined,
    textDiffs,
    imageDiffs,
  };
}

export function applyDeltaCommand(
  current: EditorDocumentState,
  cmd: EditorDeltaCommand,
  direction: 'undo' | 'redo'
): EditorDocumentState {
  const objects = cmd.objectsChanged
    ? (direction === 'undo' ? cmd.prevObjects : cmd.nextObjects) ?? current.objects
    : current.objects;

  let modifiedTexts = current.contentEdits.modifiedTexts;
  if (cmd.textDiffs.length > 0) {
    modifiedTexts = { ...modifiedTexts };
    for (const diff of cmd.textDiffs) {
      const value = direction === 'undo' ? diff.prev : diff.next;
      if (value) modifiedTexts[diff.id] = value;
      else delete modifiedTexts[diff.id];
    }
  }

  let modifiedImages = current.contentEdits.modifiedImages;
  if (cmd.imageDiffs.length > 0) {
    modifiedImages = { ...modifiedImages };
    for (const diff of cmd.imageDiffs) {
      const value = direction === 'undo' ? diff.prev : diff.next;
      if (value) modifiedImages[diff.id] = value;
      else delete modifiedImages[diff.id];
    }
  }

  return {
    objects,
    contentEdits: { modifiedTexts, modifiedImages },
  };
}
