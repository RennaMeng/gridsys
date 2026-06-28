import { LayoutBlock } from '../types';
import { RenderElement, RenderJSON } from './templateTypes';

const EDITOR_COLUMNS = 24;
const EDITOR_ROWS = 16;

const toGrid = (value: number, total: number, units: number) => Math.round((value / total) * units);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const blockType = (element: RenderElement): LayoutBlock['type'] => {
  if (element.type === 'image') return 'image';
  if (element.style === 'title') return 'title';
  if (element.style === 'heading') return 'heading';
  if (element.type === 'text' || element.type === 'caption' || element.type === 'annotation') return 'text';
  return 'container';
};

const fitTextStyle = (label: string, w: number, h: number, baseFontSize: number, requestedClamp?: number) => {
  const availableCells = Math.max(1, w * h);
  const charCount = label.replace(/\s+/g, '').length;
  const density = charCount / availableCells;
  const fittedFontSize = density > 18
    ? baseFontSize * 0.58
    : density > 12
      ? baseFontSize * 0.7
      : density > 8
        ? baseFontSize * 0.82
        : baseFontSize;
  const maxLinesByHeight = Math.max(1, Math.floor((h * 1.65) / Math.max(0.8, fittedFontSize / 12)));
  const lineClamp = Math.min(requestedClamp || maxLinesByHeight, maxLinesByHeight);

  return {
    fontSize: Math.max(7, Math.round(fittedFontSize)),
    lineClamp
  };
};

export function renderJSONToLayoutBlocks(renderJSON: RenderJSON): LayoutBlock[] {
  return renderJSON.elements.map((element, index) => {
    const x = clamp(toGrid(element.x, renderJSON.canvas.width, EDITOR_COLUMNS), 0, EDITOR_COLUMNS - 1);
    const y = clamp(toGrid(element.y, renderJSON.canvas.height, EDITOR_ROWS), 0, EDITOR_ROWS - 1);
    const w = clamp(toGrid(element.w, renderJSON.canvas.width, EDITOR_COLUMNS), 1, EDITOR_COLUMNS - x);
    const h = clamp(toGrid(element.h, renderJSON.canvas.height, EDITOR_ROWS), 1, EDITOR_ROWS - y);
    const type = blockType(element);
    const isText = type === 'text' || type === 'heading' || type === 'title';
    const textRules = element.textRules;
    const fallbackFontSize = element.style === 'title' ? 28 : element.style === 'heading' ? 18 : element.type === 'chart' ? 26 : 12;
    const label = element.type === 'chart'
      ? `${element.value || '--'}\n${element.label || 'Chart placeholder'}`
      : element.type === 'divider'
        ? 'DIVIDER'
        : element.content || element.label || element.id;
    const baseFontSize = textRules?.fontSize || fallbackFontSize;
    const fittedText = isText ? fitTextStyle(String(label), w, h, baseFontSize, textRules?.lineClamp) : null;

    return {
      id: `${element.id}-${index}`,
      type,
      label,
      x,
      y,
      w,
      h,
      category: 'Generic',
      imageUrl: element.type === 'image' ? element.src : undefined,
      imageFit: element.crop || 'cover',
      imageZoom: 1,
      imagePanX: 0,
      imagePanY: 0,
      fontSize: fittedText?.fontSize || baseFontSize,
      fontFamily: 'Inter, sans-serif',
      fontWeight: element.style === 'title' || element.style === 'heading' || element.type === 'chart' ? 'bold' : 'normal',
      fontStyle: element.type === 'caption' ? 'italic' : 'normal',
      textColor: '#111111',
      backgroundColor: element.backgroundColor || (element.type === 'annotation' ? '#1040FF' : element.type === 'chart' ? '#FFF3C4' : 'transparent'),
      overflowMode: isText ? (textRules?.overflow || 'clip') : 'clip',
      padding: isText ? (textRules?.padding ?? 8) : undefined,
      lineClamp: isText ? fittedText?.lineClamp : undefined,
      zIndex: element.zIndex || index + 1,
      generatedByAI: true,
      sourceSlotId: element.sourceSlotId || element.id,
      previewSlotKind: element.previewSlotKind
    };
  });
}
