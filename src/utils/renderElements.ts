import { LayoutBlock } from '../types';
import { RenderElement, RenderJSON } from './templateTypes';

const toGrid = (value: number, total: number, units: number) => Math.round((value / total) * units);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const blockType = (element: RenderElement): LayoutBlock['type'] => {
  if (element.type === 'image') return 'image';
  if (element.style === 'title') return 'title';
  if (element.style === 'heading') return 'heading';
  if (element.type === 'text' || element.type === 'caption' || element.type === 'annotation') return 'text';
  return 'container';
};

export function renderJSONToLayoutBlocks(renderJSON: RenderJSON): LayoutBlock[] {
  return renderJSON.elements.map((element, index) => {
    const x = clamp(toGrid(element.x, renderJSON.canvas.width, 12), 0, 11);
    const y = clamp(toGrid(element.y, renderJSON.canvas.height, 8), 0, 7);
    const w = clamp(toGrid(element.w, renderJSON.canvas.width, 12), 1, 12 - x);
    const h = clamp(toGrid(element.h, renderJSON.canvas.height, 8), 1, 8 - y);
    const type = blockType(element);
    const isText = type === 'text' || type === 'heading' || type === 'title';

    return {
      id: `${element.id}-${index}`,
      type,
      label: element.type === 'chart'
        ? `${element.value || '--'}\n${element.label || 'Chart placeholder'}`
        : element.type === 'divider'
          ? 'DIVIDER'
          : element.content || element.label || element.id,
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
      fontSize: element.style === 'title' ? 28 : element.style === 'heading' ? 18 : element.type === 'chart' ? 26 : 12,
      fontFamily: 'Inter, sans-serif',
      fontWeight: element.style === 'title' || element.style === 'heading' || element.type === 'chart' ? 'bold' : 'normal',
      fontStyle: element.type === 'caption' ? 'italic' : 'normal',
      textColor: '#111111',
      backgroundColor: element.type === 'annotation' ? '#1040FF' : element.type === 'chart' ? '#FFF3C4' : 'transparent',
      overflowMode: isText ? 'visible' : 'clip',
      padding: isText ? 8 : undefined,
      zIndex: element.zIndex || index + 1,
      generatedByAI: true
    };
  });
}
