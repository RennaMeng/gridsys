/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import html2canvas from 'html2canvas';
import { 
  Plus, 
  Minus, 
  Grid3X3, 
  Type, 
  Image as ImageIcon, 
  Layers, 
  Settings2, 
  Search,
  Maximize2,
  Lock,
  Unlock,
  ChevronRight,
  Info,
  Box,
  LayoutGrid,
  FileText,
  Workflow,
  Upload,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Fullscreen,
  Scaling,
  Undo2,
  Redo2,
  RotateCcw,
  Link,
  MousePointer2,
  HelpCircle,
  X,
  Bold,
  Italic,
  Shuffle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LayoutBlock, GridSettings } from './types';
import { loadTemplate } from './utils/loadTemplate';
import { TemplateGuide, TemplateJSON } from './utils/templateTypes';

// Constants
const DEFAULT_COLUMNS = 6;
const DEFAULT_ROWS = 6;
const DEFAULT_MARGIN = 48;
const DEFAULT_GUTTER = 0;
const DEFAULT_BASELINE = 12;
const DEFAULT_TEMPLATE_ID = 'a3_landscape_board_04';
const A3_TEMPLATE_IDS = ['a3_landscape_board_04', 'a3_landscape_board_05'];

type CanvasPresetId = 'digital-16-9' | 'strip-1800-768' | 'a3' | 'a4';
type CanvasOrientation = 'landscape' | 'portrait';
type LayoutMode = 'strict' | 'editorial';
type SidebarMode = 'generate' | 'edit';
type Language = 'zh' | 'en';
type ReferenceMode = 'template' | 'upload';
type ImageAssetRole = 'hero_image' | 'supporting_image' | 'diagram_image' | 'data_visualization' | 'icon_image' | 'background_image' | 'portrait_image' | 'product_image' | 'reference';
type TextAssetRole = 'title' | 'subtitle' | 'body' | 'caption' | 'label';

type ImageAsset = {
  id: string;
  name: string;
  dataUrl: string;
  role: ImageAssetRole;
  width?: number;
  height?: number;
};

type TextAsset = {
  id: string;
  label: string;
  content: string;
  role: TextAssetRole;
};

type TemplateElement = NonNullable<TemplateJSON['elements']>[number];

type GridSpec = {
  columns: number;
  rows: number;
  margin: number;
  gutter: number;
  rowGap: number;
  baseline: number;
  guides?: NonNullable<TemplateJSON['grid']['guides']>;
};

const TEXT_BLOCK_TYPES: LayoutBlock['type'][] = ['text', 'heading', 'title'];
const isTextBlock = (type: LayoutBlock['type']) => TEXT_BLOCK_TYPES.includes(type);
const createLocalId = () => Math.random().toString(36).slice(2, 10);
const IMAGE_ROLE_OPTIONS: Array<{ label: string; value: Exclude<ImageAssetRole, 'reference'> }> = [
  { label: 'HERO', value: 'hero_image' },
  { label: 'SUPPORT', value: 'supporting_image' },
  { label: 'DIAGRAM', value: 'diagram_image' },
  { label: 'CHART', value: 'data_visualization' },
  { label: 'ICON', value: 'icon_image' },
  { label: 'BG', value: 'background_image' },
  { label: 'PERSON', value: 'portrait_image' },
  { label: 'PRODUCT', value: 'product_image' }
];
const isInteractiveTarget = (target: EventTarget | null) => (
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement ||
  target instanceof HTMLButtonElement ||
  target instanceof HTMLAnchorElement ||
  (target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, button, a, [contenteditable="true"]')))
);

const shuffled = <T,>(items: T[]) => {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

const CANVAS_PRESETS: Array<{
  id: CanvasPresetId;
  label: string;
  viewportLabel: string;
  width: number;
  height: number;
  defaultOrientation: CanvasOrientation;
}> = [
  { id: 'digital-16-9', label: '16:9', viewportLabel: '16:9_DIGITAL', width: 960, height: 540, defaultOrientation: 'landscape' },
  { id: 'strip-1800-768', label: 'STRIP', viewportLabel: 'STRIP_1800x768', width: 1800, height: 768, defaultOrientation: 'landscape' },
  { id: 'a3', label: 'A3', viewportLabel: 'A3_PRINT', width: 1190.55, height: 841.89, defaultOrientation: 'landscape' },
  { id: 'a4', label: 'A4', viewportLabel: 'A4_PRINT', width: 794, height: 1123, defaultOrientation: 'portrait' },
];

const UI_TEXT = {
  zh: {
    undo: '撤回',
    redo: '重做',
    reset: '重置',
    viewport: '版面',
    scale: '缩放',
    fit: '适应',
    visibility: '网格',
    guide: '指南',
    workflow: '工作流',
    aiGenerate: '模板 / 素材',
    freeEdit: '自由编辑',
    reference: '1. 参考',
    template: '模板',
    ownReference: '上传参考',
    templateHelp: '加载当前 A3 模板并读取网格/基线。',
    ownReferenceHelp: '上传自己的排版参考图，作为视觉参照保存。',
    selectTemplate: '选择模板',
    uploadReference: '上传参考图',
    assets: '2. 素材',
    uploadImages: '上传图片',
    useTextAssets: '使用文字素材',
    useTextAssetsHelp: '开启后可以上传标题、正文和说明文字。',
    addText: '添加文字',
    generate: '随机分配素材',
    updateWithAI: '重新随机分配',
    aiEdit: '3. 本地分配',
    aiEditIntro: '上传素材后，将文字和图片随机填入当前区块。',
    generateInfo: '图片和文字会在本地随机填入，也可以拖拽或手动调整。',
    aiPlaceholder: '本地分配模式不需要提示词。',
    inspector: '参数调整',
    selectElement: '选择元素',
    selectedBlocks: '已选择区块',
    layerOrder: '图层顺序',
    imageTransform: '图片调整',
    textLayer: '文本层',
    background: '背景',
    padding: '内边距',
    lineClamp: '行数限制',
    typeface: '字体',
    weight: '字重',
    style: '样式',
    color: '颜色',
    size: '字号',
    alignment: '对齐',
    content: '内容 / 信息',
    blockLabel: '区块文字',
    hyperlink: '链接',
    export: '导出',
    exportSvg: '导出 SVG',
    exportPdf: '导出 PDF 规格',
    replaceImage: '替换图片',
    fitMode: '适配模式',
    basicBlocks: '基础区块',
    layoutMode: '排版模式',
    stages: {
      discover: '发现',
      define: '定义',
      develop: '发展',
      deliver: '交付',
    },
    autoMatch: '自动匹配',
    loading: '加载中',
  },
  en: {
    undo: 'Undo',
    redo: 'Redo',
    reset: 'Reset',
    viewport: 'Viewport',
    scale: 'Scale',
    fit: 'Fit',
    visibility: 'Grid',
    guide: 'Guide',
    workflow: 'Workflow',
    aiGenerate: 'Template Assets',
    freeEdit: 'Free Edit',
    reference: '1. Reference',
    template: 'Template',
    ownReference: 'Upload Reference',
    templateHelp: 'Load the current A3 template and read its grid/baseline.',
    ownReferenceHelp: 'Upload your own layout reference as a visual guide.',
    selectTemplate: 'Select Template',
    uploadReference: 'Upload Reference Images',
    assets: '2. Assets',
    uploadImages: 'Upload Images',
    useTextAssets: 'Use Text Assets',
    useTextAssetsHelp: 'Enable this to upload titles, body copy, and captions.',
    addText: 'Add Text',
    generate: 'Random Assign Assets',
    updateWithAI: 'Random Assign Again',
    aiEdit: '3. Local Assignment',
    aiEditIntro: 'Upload assets, then fill current blocks locally at random.',
    generateInfo: 'Images and text are filled locally at random and remain manually editable.',
    aiPlaceholder: 'Local assignment does not need a prompt.',
    inspector: 'Parametric Inspector',
    selectElement: 'Select Element',
    selectedBlocks: 'Blocks Selected',
    layerOrder: 'Layer Order',
    imageTransform: 'Image Transform',
    textLayer: 'Text Layer',
    background: 'Background',
    padding: 'Padding',
    lineClamp: 'Line Clamp',
    typeface: 'Typeface',
    weight: 'Weight',
    style: 'Style',
    color: 'Color',
    size: 'Size',
    alignment: 'Alignment',
    content: 'Content / Metadata',
    blockLabel: 'Block Label',
    hyperlink: 'Hyperlink',
    export: 'Export',
    exportSvg: 'Export SVG',
    exportPdf: 'Export PDF Spec',
    replaceImage: 'Replace Image',
    fitMode: 'Fit Mode',
    basicBlocks: 'Basic Blocks',
    layoutMode: 'Layout Mode',
    stages: {
      discover: 'Discover',
      define: 'Define',
      develop: 'Develop',
      deliver: 'Deliver',
    },
    autoMatch: 'Auto match',
    loading: 'Loading',
  }
} as const;

const resolveCanvasSize = (
  preset: typeof CANVAS_PRESETS[number],
  orientation: CanvasOrientation
) => {
  const shortSide = Math.min(preset.width, preset.height);
  const longSide = Math.max(preset.width, preset.height);

  return orientation === 'landscape'
    ? { width: longSide, height: shortSide }
    : { width: shortSide, height: longSide };
};

const getTemplateGridSpec = (template: TemplateJSON | null, presetId: CanvasPresetId): GridSpec => {
  const templateGrid = template?.grid;
  const columnGap = templateGrid?.columnGap ?? DEFAULT_GUTTER;
  const rowGap = templateGrid?.rowGap ?? columnGap;
  const fallbackColumns = presetId === 'a3' ? DEFAULT_COLUMNS : 24;
  const fallbackRows = presetId === 'a3' ? DEFAULT_ROWS : 16;

  return {
    columns: templateGrid?.columns ?? fallbackColumns,
    rows: templateGrid?.rows ?? fallbackRows,
    margin: templateGrid?.margin ?? DEFAULT_MARGIN,
    gutter: columnGap,
    rowGap,
    baseline: templateGrid?.baseline?.increment ?? DEFAULT_BASELINE,
    guides: templateGrid?.guides
  };
};

const getGridMetrics = (preset: { width: number; height: number }, gridSpec: GridSpec) => {
  const safeAreaWidth = preset.width - (gridSpec.margin * 2);
  const safeAreaHeight = preset.height - (gridSpec.margin * 2);
  const colWidth = (safeAreaWidth - (gridSpec.columns - 1) * gridSpec.gutter) / gridSpec.columns;
  const rowHeight = (safeAreaHeight - (gridSpec.rows - 1) * gridSpec.rowGap) / gridSpec.rows;
  const colUnit = colWidth + gridSpec.gutter;
  const rowUnit = rowHeight + gridSpec.rowGap;

  return {
    ...gridSpec,
    safeAreaWidth,
    safeAreaHeight,
    colWidth,
    rowHeight,
    colUnit,
    rowUnit,
  };
};

const buildModuleGuides = (count: number, moduleSize: number, gap: number) => {
  const positions = new Set<number>([0]);
  let cursor = 0;
  for (let i = 0; i < count; i += 1) {
    cursor += moduleSize;
    positions.add(Number(cursor.toFixed(3)));
    if (i < count - 1) {
      cursor += gap;
      positions.add(Number(cursor.toFixed(3)));
    }
  }
  return [...positions].sort((a, b) => a - b);
};

const normalizeGuides = (guides: TemplateGuide[] | undefined, fallback: number[]): Array<Exclude<TemplateGuide, number>> => (
  guides?.length
    ? guides.map(guide => typeof guide === 'number' ? { position: guide } : guide)
    : fallback.map(position => ({ position }))
);

const getPixelRect = (
  x: number,
  y: number,
  w: number,
  h: number,
  metrics: ReturnType<typeof getGridMetrics>
) => ({
  left: x * metrics.colUnit,
  top: y * metrics.rowUnit,
  width: w * metrics.colWidth + Math.max(0, w - 1) * metrics.gutter,
  height: h * metrics.rowHeight + Math.max(0, h - 1) * metrics.rowGap
});

const getBlockRect = (block: LayoutBlock, metrics: ReturnType<typeof getGridMetrics>) => {
  if (block.frame) {
    const frameLeft = block.frame.origin === 'canvas'
      ? block.frame.x - metrics.margin
      : block.frame.x;
    const frameTop = block.frame.origin === 'canvas'
      ? block.frame.y - metrics.margin
      : block.frame.y;
    return {
      left: frameLeft,
      top: frameTop,
      width: block.frame.w,
      height: block.frame.h
    };
  }
  return getPixelRect(block.x, block.y, block.w, block.h, metrics);
};

const templateElementToBlockType = (element: TemplateElement): LayoutBlock['type'] => {
  if (element.type === 'image') return 'image';
  if (element.role?.includes('title') || ['h1', 'h2', 'h3', 'h4', 'h5'].includes(String(element.style))) return 'title';
  if (element.type === 'text' || element.type === 'caption' || element.type === 'annotation') return 'text';
  return 'container';
};

const getTemplateElementKind = (element: TemplateElement) => {
  if (element.type === 'image') return 'image';
  const role = element.role || '';
  const style = String(element.style || '');
  if (role.includes('title') || style.startsWith('h')) return 'title';
  if (role.includes('caption') || element.type === 'caption' || element.type === 'annotation') return 'caption';
  if (role.includes('body') || role.includes('text')) return 'body';
  return 'text';
};

const templateElementToLayoutBlock = (element: TemplateElement, index: number, overrides: Partial<LayoutBlock> = {}): LayoutBlock => {
  const type = templateElementToBlockType(element);
  const isText = isTextBlock(type);
  const backgroundColor = element.type === 'image'
    ? '#E9E9E9'
    : isText
      ? 'transparent'
      : (element.placeholderColor || '#FFFFFF');

  return {
    id: `${element.slotId}-${index}-${createLocalId()}`,
    type,
    label: element.placeholderLabel || element.contentSummary || element.role || element.slotId,
    x: element.x,
    y: element.y,
    w: element.w,
    h: element.h,
    frame: element.frame,
    category: 'Generic',
    imageFit: element.crop || 'cover',
    imageZoom: 1,
    imagePanX: 0,
    imagePanY: 0,
    fontSize: element.textRules?.fontSize || (element.style === 'h5' ? 20 : 8),
    fontFamily: 'Inter, sans-serif',
    fontWeight: element.role?.includes('title') ? 'bold' : 'normal',
    fontStyle: element.role?.includes('caption') ? 'italic' : 'normal',
    textColor: '#111111',
    backgroundColor,
    overflowMode: isText ? (element.textRules?.overflow || 'clip') : 'clip',
    padding: isText ? (element.textRules?.padding ?? 0) : undefined,
    lineClamp: isText ? element.textRules?.lineClamp : undefined,
    zIndex: element.zIndex || index + 1,
    generatedByAI: false,
    sourceSlotId: element.slotId,
    previewSlotKind: element.type === 'image' ? 'image' : isText ? 'text' : undefined,
    ...overrides
  };
};

const INITIAL_BLOCKS: LayoutBlock[] = [
  { 
    id: '1', 
    type: 'text', 
    label: '点击编辑文字', 
    x: 0, 
    y: 0, 
    w: 4, 
    h: 2, 
    category: 'Generic',
    fontSize: 18,
    fontFamily: 'Inter, sans-serif',
    fontWeight: 'bold',
    textColor: '#111111',
    overflowMode: 'visible',
    padding: 8,
    zIndex: 2
  },
  { 
    id: '2', 
    type: 'image', 
    label: 'IMAGE', 
    x: 4, 
    y: 0, 
    w: 4, 
    h: 3, 
    category: 'Generic',
    imageFit: 'cover',
    imageZoom: 1,
    imagePanX: 0,
    imagePanY: 0,
    zIndex: 1
  },
];

export default function App() {
  const [blocks, setBlocks] = useState<LayoutBlock[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [history, setHistory] = useState<LayoutBlock[][]>([]);
  const [future, setFuture] = useState<LayoutBlock[][]>([]);
  const blocksRef = useRef<LayoutBlock[]>([]);
  const [showGrid, setShowGrid] = useState(true);
  const [showBaseline, setShowBaseline] = useState(true);
  const [zoom, setZoom] = useState(0.85);
  const [isLocked, setIsLocked] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('editorial');
  const [language, setLanguage] = useState<Language>('zh');
  const [showGuide, setShowGuide] = useState(() => localStorage.getItem('gridSysGuideSeen') !== '1');
  const [canvasPresetId, setCanvasPresetId] = useState<CanvasPresetId>('a3');
  const [canvasOrientation, setCanvasOrientation] = useState<CanvasOrientation>('landscape');
  const [activeTemplate, setActiveTemplate] = useState<TemplateJSON | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState(DEFAULT_TEMPLATE_ID);
  const [availableTemplates, setAvailableTemplates] = useState<TemplateJSON[]>([]);
  const canvasPreset = useMemo(
    () => CANVAS_PRESETS.find(preset => preset.id === canvasPresetId) || CANVAS_PRESETS[0],
    [canvasPresetId]
  );
  const canvasSize = useMemo(
    () => resolveCanvasSize(canvasPreset, canvasOrientation),
    [canvasPreset, canvasOrientation]
  );
  const canvasViewportLabel = `${canvasPreset.viewportLabel}_${canvasOrientation.toUpperCase()}`;
  const activeGridSpec = useMemo(
    () => getTemplateGridSpec(activeTemplate, canvasPresetId),
    [activeTemplate, canvasPresetId]
  );
  const gridMetrics = useMemo(() => getGridMetrics(canvasSize, activeGridSpec), [activeGridSpec, canvasSize]);
  const workspaceRef = useRef<HTMLElement>(null);
  
  // 素材池与本地分配状态
  const [imageAssets, setImageAssets] = useState<ImageAsset[]>([]);
  const [textAssets, setTextAssets] = useState<TextAsset[]>([]);
  const [newTextAsset, setNewTextAsset] = useState('');
  const [newTextRole, setNewTextRole] = useState<TextAssetRole>('body');
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('generate');
  const [referenceMode, setReferenceMode] = useState<ReferenceMode>('template');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    pageType: false,
    assets: false,
    ai: false,
    reference: true,
    basicBlocks: false,
    editLayout: false
  });
  
  // Drag State
  const [dragPreview, setDragPreview] = useState<{ id: string, x: number, y: number } | null>(null);
  const [selectionBox, setSelectionBox] = useState<{ left: number, top: number, width: number, height: number } | null>(null);
  const [aiConfirmOpen, setAiConfirmOpen] = useState(false);
  const [aiPreparingPreview, setAiPreparingPreview] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiPreviewImage, setAiPreviewImage] = useState<string | null>(null);
  const [aiPendingBoardImage, setAiPendingBoardImage] = useState<string | null>(null);
  const [aiGenerationError, setAiGenerationError] = useState<string | null>(null);
  const safeAreaRef = useRef<HTMLDivElement>(null);
  const boardCaptureRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<{ startX: number, startY: number } | null>(null);
  const dragRef = useRef<{
    ids: string[]
    startMouseX: number
    startMouseY: number
    startPositions: Record<string, { x: number, y: number }>
    startFrames: Record<string, NonNullable<LayoutBlock['frame']>>
  } | null>(null);
  const resizeRef = useRef<{
    id: string
    startMouseX: number
    startMouseY: number
    startW: number
    startH: number
    startFrame?: NonNullable<LayoutBlock['frame']>
  } | null>(null);
  const [isResizing, setIsResizing] = useState(false);

  const fitCanvasToViewport = useCallback(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;

    const styles = window.getComputedStyle(workspace);
    const horizontalPadding = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    const verticalPadding = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
    const availableWidth = workspace.clientWidth - horizontalPadding - 64;
    const availableHeight = workspace.clientHeight - verticalPadding - 96;
    const nextZoom = Math.min(
      availableWidth / canvasSize.width,
      availableHeight / canvasSize.height,
      1.15
    );

    setZoom(Math.max(0.18, Math.min(nextZoom, 1.5)));
  }, [canvasSize.height, canvasSize.width]);

  // Selected block data
  const selectedBlock = useMemo(() => 
    selectedIds.length === 1 ? blocks.find(b => b.id === selectedIds[0]) : null, 
    [blocks, selectedIds]
  );
  const isSelectedTextBlock = selectedBlock ? isTextBlock(selectedBlock.type) : false;
  const isSelectedImageBlock = selectedBlock?.type === 'image';
  const t = UI_TEXT[language];

  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

  useEffect(() => {
    Promise.all(A3_TEMPLATE_IDS.map(templateId => loadTemplate(templateId)))
      .then(templates => {
        setAvailableTemplates(templates);
        const defaultTemplate = templates.find(template => template.templateMeta.templateId === DEFAULT_TEMPLATE_ID) || templates[0];
        setActiveTemplate(defaultTemplate);
        setActiveTemplateId(defaultTemplate.templateMeta.templateId);
        setCanvasPresetId('a3');
        setCanvasOrientation('landscape');
        setBlocks([]);
        blocksRef.current = [];
        setSelectedId(null);
        setSelectedIds([]);
      })
      .catch(error => {
        console.warn('Failed to load A3 templates', error);
      });
  }, []);

  const rememberBlocks = () => {
    const snapshot = blocksRef.current.map(block => ({ ...block }));
    setHistory(prev => [...prev.slice(-29), snapshot]);
    setFuture([]);
  };

  const undo = () => {
    setHistory(prev => {
      const previous = prev[prev.length - 1];
      if (!previous) return prev;
      const current = blocksRef.current.map(block => ({ ...block }));
      setFuture(next => [current, ...next.slice(0, 29)]);
      setBlocks(previous);
      setSelectedId(null);
      setSelectedIds([]);
      return prev.slice(0, -1);
    });
  };

  const redo = () => {
    setFuture(prev => {
      const next = prev[0];
      if (!next) return prev;
      const current = blocksRef.current.map(block => ({ ...block }));
      setHistory(historyPrev => [...historyPrev.slice(-29), current]);
      setBlocks(next);
      setSelectedId(null);
      setSelectedIds([]);
      return prev.slice(1);
    });
  };

  const resetCanvas = () => {
    setBlocks([]);
    blocksRef.current = [];
    setSelectedId(null);
    setSelectedIds([]);
    setHistory([]);
    setFuture([]);
  };

  const selectOnly = (id: string | null) => {
    setSelectedId(id);
    setSelectedIds(id ? [id] : []);
  };

  const updateBlock = (id: string, updates: Partial<LayoutBlock>, remember = false) => {
    if (remember) rememberBlocks();
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  };

  const selectCanvasPreset = (preset: typeof CANVAS_PRESETS[number]) => {
    setCanvasPresetId(preset.id);
    setCanvasOrientation(preset.defaultOrientation);
  };

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  useEffect(() => {
    fitCanvasToViewport();
  }, [fitCanvasToViewport]);

  useEffect(() => {
    window.addEventListener('resize', fitCanvasToViewport);
    return () => window.removeEventListener('resize', fitCanvasToViewport);
  }, [fitCanvasToViewport]);

  const addBlock = (name: string, category: LayoutBlock['category'], type: LayoutBlock['type'] = 'container') => {
    rememberBlocks();
    const newBlock: LayoutBlock = {
      id: Math.random().toString(36).substr(2, 9),
      type: type,
      label: type === 'text' ? '点击编辑文字' : type === 'blank' ? '' : name.toUpperCase(),
      x: 0,
      y: 0,
      w: type === 'image' ? 3 : type === 'text' ? 3 : 1,
      h: type === 'image' ? 3 : type === 'text' ? 2 : 1,
      category: category,
      imageFit: 'cover',
      imageZoom: 1,
      imagePanX: 0,
      imagePanY: 0,
      fontSize: type === 'text' || type === 'heading' || type === 'title' ? 14 : undefined,
      fontFamily: type === 'text' || type === 'heading' || type === 'title' ? 'Inter, sans-serif' : undefined,
      fontWeight: 'normal',
      fontStyle: 'normal',
      textColor: '#111111',
      backgroundColor: 'transparent',
      overflowMode: isTextBlock(type) ? 'visible' : 'clip',
      padding: isTextBlock(type) ? 8 : undefined,
      zIndex: blocks.length + 1
    };
    
    setBlocks([...blocks, newBlock]);
    selectOnly(newBlock.id);
  };

  const loadTemplateBlocks = (template = activeTemplate) => {
    if (!template) return;
    rememberBlocks();
    setActiveTemplate(template);
    setActiveTemplateId(template.templateMeta.templateId);
    setCanvasPresetId('a3');
    setCanvasOrientation('landscape');
    const templateBlocks = (template.elements || [])
      .slice()
      .sort((a, b) => (a.order || 999) - (b.order || 999))
      .map((element, index) => templateElementToLayoutBlock(element, index));
    setBlocks(templateBlocks);
    blocksRef.current = templateBlocks;
    selectOnly(null);
  };

  const applyCompact = (currentBlocks: LayoutBlock[], activeId?: string) => {
    const sorted = [...currentBlocks].sort((a, b) => a.y - b.y || a.x - b.x);
    const placed: LayoutBlock[] = [];
    
    // We process the active block first (if dragging) to make it the "anchor" 
    // that others must move around.
    const activeBlock = activeId ? currentBlocks.find(b => b.id === activeId) : null;
    if (activeBlock) {
      placed.push(activeBlock);
    }

    for (const block of sorted) {
      if (block.id === activeId) continue;
      
      let newY = 0;
      while (newY + block.h <= gridMetrics.rows) {
        const collision = placed.some(p => 
          p.x < block.x + block.w &&
          p.x + p.w > block.x &&
          p.y < newY + block.h &&
          p.y + p.h > newY
        );
        if (collision) {
          newY++;
          continue;
        }
        break;
      }
      placed.push({ ...block, y: newY });
    }
    return placed.sort((a, b) => {
      const idxA = currentBlocks.findIndex(ob => ob.id === a.id);
      const idxB = currentBlocks.findIndex(ob => ob.id === b.id);
      return idxA - idxB;
    });
  };

  const settleBlocks = (nextBlocks: LayoutBlock[], activeId?: string) => (
    layoutMode === 'strict' ? applyCompact(nextBlocks, activeId) : nextBlocks
  );

  const updateLayerOrder = (id: string, direction: 'front' | 'back' | 'up' | 'down') => {
    rememberBlocks();
    setBlocks(prev => {
      const zValues = prev.map(block => block.zIndex || 1);
      const minZ = Math.min(...zValues, 1);
      const maxZ = Math.max(...zValues, 1);

      return prev.map(block => {
        if (block.id !== id) return block;

        const currentZ = block.zIndex || 1;
        const nextZ = direction === 'front'
          ? maxZ + 1
          : direction === 'back'
            ? minZ - 1
            : direction === 'up'
              ? currentZ + 1
              : currentZ - 1;

        return { ...block, zIndex: nextZ };
      });
    });
  };

  // DRAG DRAG ENGINE
  const handleDragStart = (e: React.MouseEvent, id: string) => {
    if (isLocked) return;
    const block = blocksRef.current.find(b => b.id === id);
    if (!block) return;
    const shouldToggle = e.shiftKey || e.metaKey;
    const nextSelected = shouldToggle
      ? (selectedIds.includes(id) ? selectedIds.filter(selected => selected !== id) : [...selectedIds, id])
      : (selectedIds.includes(id) ? selectedIds : [id]);

    const activeIds = shouldToggle ? nextSelected : (nextSelected.length ? nextSelected : [id]);
    setSelectedIds(activeIds);
    setSelectedId(activeIds[0] || null);
    if ((shouldToggle && selectedIds.includes(id)) || activeIds.length === 0) return;
    rememberBlocks();

    dragRef.current = {
      ids: activeIds,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startPositions: Object.fromEntries(
        blocksRef.current
          .filter(b => activeIds.includes(b.id))
          .map(b => [b.id, { x: b.x, y: b.y }])
      ),
      startFrames: Object.fromEntries(
        blocksRef.current
          .filter(b => activeIds.includes(b.id) && b.frame)
          .map(b => [b.id, b.frame!])
      )
    };

    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
  };

  const handleDragMove = (e: MouseEvent) => {
    if (!dragRef.current) return;
    const { ids, startMouseX, startMouseY, startPositions, startFrames } = dragRef.current;
    const currentBlocks = blocksRef.current;
    const leadId = ids[0];
    const block = currentBlocks.find(b => b.id === leadId);
    if (!block) return;

    const dx = Math.round((e.clientX - startMouseX) / zoom / gridMetrics.colUnit);
    const dy = Math.round((e.clientY - startMouseY) / zoom / gridMetrics.rowUnit);
    const selectedBlocks = currentBlocks.filter(b => ids.includes(b.id));
    const hasFrameBlocks = selectedBlocks.some(b => b.frame);
    if (hasFrameBlocks) {
      const dxPt = (e.clientX - startMouseX) / zoom;
      const dyPt = (e.clientY - startMouseY) / zoom;
      setBlocks(currentBlocks.map(b => {
        const startFrame = startFrames[b.id];
        if (!ids.includes(b.id) || !startFrame) return b;
        return {
          ...b,
          frame: {
            ...startFrame,
            x: Math.max(0, Math.min(gridMetrics.safeAreaWidth - startFrame.w, startFrame.x + dxPt)),
            y: Math.max(0, Math.min(gridMetrics.safeAreaHeight - startFrame.h, startFrame.y + dyPt))
          }
        };
      }));
      return;
    }
    const minDx = Math.max(...selectedBlocks.map(b => -startPositions[b.id].x));
    const maxDx = Math.min(...selectedBlocks.map(b => gridMetrics.columns - b.w - startPositions[b.id].x));
    const minDy = Math.max(...selectedBlocks.map(b => -startPositions[b.id].y));
    const maxDy = Math.min(...selectedBlocks.map(b => gridMetrics.rows - b.h - startPositions[b.id].y));
    const clampedDx = Math.max(minDx, Math.min(maxDx, dx));
    const clampedDy = Math.max(minDy, Math.min(maxDy, dy));

    const newX = startPositions[leadId].x + clampedDx;
    const newY = startPositions[leadId].y + clampedDy;

    // Update real-time if grid position changed
    if (newX !== block.x || newY !== block.y || !dragPreview) {
      setDragPreview({ id: leadId, x: newX, y: newY });
      
      const movedBlocks = currentBlocks.map(b => 
        ids.includes(b.id)
          ? { ...b, x: startPositions[b.id].x + clampedDx, y: startPositions[b.id].y + clampedDy }
          : b
      );
      setBlocks(ids.length > 1 ? movedBlocks : settleBlocks(movedBlocks, leadId));
    }
  };

  const handleDragEnd = () => {
    dragRef.current = null;
    setDragPreview(null);
    window.removeEventListener('mousemove', handleDragMove);
    window.removeEventListener('mouseup', handleDragEnd);
  };

  const handleSelectionStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isLocked || e.target !== e.currentTarget) return;
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const startX = (e.clientX - rect.left) / zoom;
    const startY = (e.clientY - rect.top) / zoom;
    selectionRef.current = { startX, startY };
    setSelectionBox({ left: startX, top: startY, width: 0, height: 0 });
    selectOnly(null);

    const handleMove = (moveEvent: MouseEvent) => {
      if (!selectionRef.current || !safeAreaRef.current) return;
      const areaRect = safeAreaRef.current.getBoundingClientRect();
      const currentX = Math.max(0, Math.min(gridMetrics.safeAreaWidth, (moveEvent.clientX - areaRect.left) / zoom));
      const currentY = Math.max(0, Math.min(gridMetrics.safeAreaHeight, (moveEvent.clientY - areaRect.top) / zoom));
      const box = {
        left: Math.min(selectionRef.current.startX, currentX),
        top: Math.min(selectionRef.current.startY, currentY),
        width: Math.abs(currentX - selectionRef.current.startX),
        height: Math.abs(currentY - selectionRef.current.startY)
      };
      setSelectionBox(box);
      const selected = blocksRef.current
        .filter(block => {
          const blockRect = getBlockRect(block, gridMetrics);
          return box.left < blockRect.left + blockRect.width &&
            box.left + box.width > blockRect.left &&
            box.top < blockRect.top + blockRect.height &&
            box.top + box.height > blockRect.top;
        })
        .map(block => block.id);
      setSelectedIds(selected);
      setSelectedId(selected[0] || null);
    };

    const handleEnd = () => {
      selectionRef.current = null;
      setSelectionBox(null);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
  };

  const handleResizeStart = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // 防止触发拖拽移动
    e.preventDefault();
    if (isLocked) return;
    const block = blocks.find(b => b.id === id);
    if (!block) return;
    rememberBlocks();

    resizeRef.current = {
      id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startW: block.w,
      startH: block.h,
      startFrame: block.frame,
    };
    setIsResizing(true);

    window.addEventListener('mousemove', handleResizeMove);
    window.addEventListener('mouseup', handleResizeEnd);
  };

  const handleResizeMove = (e: MouseEvent) => {
    if (!resizeRef.current) return;
    const { id, startMouseX, startMouseY, startW, startH } = resizeRef.current;
    const block = blocks.find(b => b.id === id);
    if (!block) return;

    if (resizeRef.current.startFrame) {
      const startFrame = resizeRef.current.startFrame;
      const dwPt = (e.clientX - startMouseX) / zoom;
      const dhPt = (e.clientY - startMouseY) / zoom;
      const nextW = Math.max(12, Math.min(gridMetrics.safeAreaWidth - startFrame.x, startFrame.w + dwPt));
      const nextH = Math.max(12, Math.min(gridMetrics.safeAreaHeight - startFrame.y, startFrame.h + dhPt));
      setBlocks(prev => prev.map(b => (
        b.id === id ? { ...b, frame: { ...startFrame, w: nextW, h: nextH } } : b
      )));
      return;
    }

    const dw = Math.round((e.clientX - startMouseX) / zoom / gridMetrics.colUnit);
    const dh = Math.round((e.clientY - startMouseY) / zoom / gridMetrics.rowUnit);

    const newW = Math.max(1, Math.min(gridMetrics.columns - block.x, startW + dw));
    const newH = Math.max(1, Math.min(gridMetrics.rows - block.y, startH + dh));

    // 实时更新，不触发 compact
    setBlocks(prev => prev.map(b =>
      b.id === id ? { ...b, w: newW, h: newH } : b
    ));
  };

  const handleResizeEnd = () => {
    resizeRef.current = null;
    setIsResizing(false);
    // 松手后触发 compact
    setBlocks(prev => settleBlocks(prev));
    window.removeEventListener('mousemove', handleResizeMove);
    window.removeEventListener('mouseup', handleResizeEnd);
  };

  const handleFileUpload = (blockId: string, file: File) => {
    rememberBlocks();
    const reader = new FileReader();
    reader.onload = (e) => {
      updateBlock(blockId, { imageUrl: e.target?.result as string });
    };
    reader.readAsDataURL(file);
  };

  const getTemplateImageSlots = () => (
    (activeTemplate?.elements || [])
      .filter(element => element.type === 'image')
      .sort((a, b) => (a.order || 999) - (b.order || 999))
  );

  const getTemplateTextSlots = (role: TextAssetRole) => {
    const elements = (activeTemplate?.elements || []).filter(element => element.type !== 'image');
    const isTitle = (element: TemplateElement) => element.role?.includes('title') || String(element.style).startsWith('h');
    const isCaption = (element: TemplateElement) => element.role?.includes('caption') || element.type === 'caption' || element.type === 'annotation';
    const isBody = (element: TemplateElement) => element.role?.includes('body') || element.role?.includes('text');

    return elements
      .filter(element => {
        if (role === 'title' || role === 'subtitle') return isTitle(element);
        if (role === 'caption' || role === 'label') return isCaption(element);
        return isBody(element) && !isTitle(element) && !isCaption(element);
      })
      .sort((a, b) => (a.order || 999) - (b.order || 999));
  };

  const upsertAssignedBlocks = (prev: LayoutBlock[], assigned: LayoutBlock[]) => {
    const bySlot = new Map(assigned.map(block => [block.sourceSlotId, block]));
    const updated = prev.map(block => (
      block.sourceSlotId && bySlot.has(block.sourceSlotId)
        ? { ...block, ...bySlot.get(block.sourceSlotId)! }
        : block
    ));
    const existingSlots = new Set(updated.map(block => block.sourceSlotId).filter(Boolean));
    return [
      ...updated,
      ...assigned.filter(block => !existingSlots.has(block.sourceSlotId))
    ];
  };

  const buildRandomImageAssignments = () => {
    const usableImages = imageAssets.filter(asset => asset.role !== 'reference');
    const imageSlots = getTemplateImageSlots();
    if (!usableImages.length || !imageSlots.length) return [];

    const remainingSlots = [...imageSlots];
    return usableImages.map((asset, assetIndex) => {
      const assetAspect = asset.width && asset.height ? asset.width / asset.height : 1;
      let bestIndex = 0;
      let bestScore = Number.POSITIVE_INFINITY;
      remainingSlots.forEach((slot, index) => {
        const slotRect = getBlockRect(templateElementToLayoutBlock(slot, index), gridMetrics);
        const slotAspect = slotRect.width / Math.max(1, slotRect.height);
        const score = Math.abs(Math.log(assetAspect / slotAspect));
        if (score < bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      });
      const slot = remainingSlots.splice(bestIndex, 1)[0];
      if (!slot) return null;
      return templateElementToLayoutBlock(slot, assetIndex, {
        label: asset.name,
        assetId: asset.id,
        imageUrl: asset.dataUrl,
        imageFit: 'cover',
        backgroundColor: '#E9E9E9'
      });
    }).filter(Boolean) as LayoutBlock[];
  };

  const randomAssignImagesToBlocks = () => {
    const assigned = buildRandomImageAssignments();
    if (!assigned.length) return;

    rememberBlocks();
    setBlocks(prev => upsertAssignedBlocks(prev, assigned));
  };

  const buildRandomTextAssignments = () => {
    const usableText = textAssets.filter(asset => asset.content.trim());
    if (!usableText.length) return [];

    const usedSlots = new Set<string>();
    const assigned: LayoutBlock[] = [];
    usableText.forEach((asset, assetIndex) => {
      const slot = getTemplateTextSlots(asset.role).find(candidate => !usedSlots.has(candidate.slotId));
      if (!slot) return;
      usedSlots.add(slot.slotId);
      assigned.push(templateElementToLayoutBlock(slot, assetIndex, {
        label: asset.content,
        fontSize: slot.textRules?.fontSize || (asset.role === 'title' ? 20 : 8),
        fontWeight: asset.role === 'title' || asset.role === 'subtitle' ? 'bold' : 'normal'
      }));
    });

    return assigned;
  };

  const randomAssignTextToBlocks = () => {
    const assigned = buildRandomTextAssignments();
    if (!assigned.length) return;

    rememberBlocks();
    setBlocks(prev => upsertAssignedBlocks(prev, assigned));
  };

  const getBlockTemplateKind = (block: LayoutBlock) => {
    const sourceElement = activeTemplate?.elements?.find(element => element.slotId === block.sourceSlotId);
    if (sourceElement) return getTemplateElementKind(sourceElement);
    if (block.type === 'image') return 'image';
    if (block.type === 'title' || block.type === 'heading') return 'title';
    if (isTextBlock(block.type)) return 'body';
    return 'text';
  };

  const moveBlockToTemplateElement = (block: LayoutBlock, element: TemplateElement, index: number): LayoutBlock => {
    const slotBlock = templateElementToLayoutBlock(element, index);
    const slotIsText = isTextBlock(slotBlock.type);

    return {
      ...block,
      x: slotBlock.x,
      y: slotBlock.y,
      w: slotBlock.w,
      h: slotBlock.h,
      frame: slotBlock.frame,
      sourceSlotId: element.slotId,
      previewSlotKind: slotBlock.previewSlotKind,
      backgroundColor: slotBlock.backgroundColor,
      imageFit: block.type === 'image' ? (block.imageFit || slotBlock.imageFit) : block.imageFit,
      overflowMode: isTextBlock(block.type) ? slotBlock.overflowMode : block.overflowMode,
      padding: isTextBlock(block.type) ? slotBlock.padding : block.padding,
      lineClamp: isTextBlock(block.type) ? slotBlock.lineClamp : block.lineClamp,
      fontSize: slotIsText ? (slotBlock.fontSize || block.fontSize) : block.fontSize,
      fontWeight: slotIsText ? (slotBlock.fontWeight || block.fontWeight) : block.fontWeight
    };
  };

  const randomizeCanvasSections = (currentBlocks: LayoutBlock[]) => {
    if (!activeTemplate) return currentBlocks;
    const templateSlots = (activeTemplate.elements || [])
      .slice()
      .sort((a, b) => (a.order || 999) - (b.order || 999));
    if (!templateSlots.length || !currentBlocks.length) return currentBlocks;

    const slotsByKind = templateSlots.reduce<Record<string, TemplateElement[]>>((groups, element) => {
      const kind = getTemplateElementKind(element);
      return {
        ...groups,
        [kind]: [...(groups[kind] || []), element]
      };
    }, {});

    const blocksByKind = currentBlocks.reduce<Record<string, LayoutBlock[]>>((groups, block) => {
      const kind = getBlockTemplateKind(block);
      return {
        ...groups,
        [kind]: [...(groups[kind] || []), block]
      };
    }, {});

    const movedBlocks = new Map<string, LayoutBlock>();
    Object.entries(blocksByKind).forEach(([kind, sameKindBlocks]) => {
      const slotPool = shuffled(slotsByKind[kind] || []);
      sameKindBlocks.forEach((block, index) => {
        const targetSlot = slotPool[index];
        if (targetSlot) {
          movedBlocks.set(block.id, moveBlockToTemplateElement(block, targetSlot, index));
        }
      });
    });

    return currentBlocks.map(block => movedBlocks.get(block.id) || block);
  };

  const randomizeCurrentLayout = () => {
    if (!activeTemplate || !blocks.length) return;
    rememberBlocks();
    setBlocks(prev => randomizeCanvasSections(prev));
  };

  const randomAssignAllAssets = () => {
    if (!activeTemplate) return;
    rememberBlocks();
    const imageAssigned = buildRandomImageAssignments();
    const textAssigned = buildRandomTextAssignments();
    setBlocks(prev => {
      const withImages = imageAssigned.length ? upsertAssignedBlocks(prev, imageAssigned) : prev;
      const withText = textAssigned.length ? upsertAssignedBlocks(withImages, textAssigned) : withImages;
      return randomizeCanvasSections(withText);
    });
  };

  // Add global key listener for deleting blocks
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't delete if user is typing in an input or textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length && !isLocked) {
        rememberBlocks();
        setBlocks(prev => settleBlocks(prev.filter(b => !selectedIds.includes(b.id))));
        selectOnly(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, isLocked, history]);

  const buildLayoutSvgMarkup = () => {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', String(canvasSize.width));
    svg.setAttribute('height', String(canvasSize.height));
    svg.setAttribute('viewBox', `0 0 ${canvasSize.width} ${canvasSize.height}`);
    svg.setAttribute('xmlns', svgNS);
    const bg = document.createElementNS(svgNS, 'rect');
    bg.setAttribute('width', String(canvasSize.width));
    bg.setAttribute('height', String(canvasSize.height));
    bg.setAttribute('fill', '#ffffff');
    svg.appendChild(bg);
    blocks.forEach(block => {
      const rect = getBlockRect(block, gridMetrics);
      const x = gridMetrics.margin + rect.left;
      const y = gridMetrics.margin + rect.top;
      const w = rect.width;
      const h = rect.height;
      const isTextLayer = isTextBlock(block.type);
      const backgroundColor = block.backgroundColor || (isTextLayer ? 'transparent' : '#ffffff');

      if (!isTextLayer || backgroundColor !== 'transparent') {
        const rect = document.createElementNS(svgNS, 'rect');
        rect.setAttribute('x', String(x));
        rect.setAttribute('y', String(y));
        rect.setAttribute('width', String(w));
        rect.setAttribute('height', String(h));
        rect.setAttribute('fill', backgroundColor === 'transparent' ? '#ffffff' : backgroundColor);
        if (!isTextLayer) {
          rect.setAttribute('stroke', '#111111');
          rect.setAttribute('stroke-width', '0.5');
        }
        svg.appendChild(rect);
      }

      if (block.imageUrl) {
        const clipId = `clip-${block.id}`;

        // 1. 定义 clipPath，严格限定在 block 的矩形范围内
        const defs = document.createElementNS(svgNS, 'defs');
        const clipPath = document.createElementNS(svgNS, 'clipPath');
        clipPath.setAttribute('id', clipId);
        const clipRect = document.createElementNS(svgNS, 'rect');
        clipRect.setAttribute('x', String(x));
        clipRect.setAttribute('y', String(y));
        clipRect.setAttribute('width', String(w));
        clipRect.setAttribute('height', String(h));
        clipPath.appendChild(clipRect);
        defs.appendChild(clipPath);
        svg.appendChild(defs);

        // 2. 计算 cover 尺寸：保持图片比例，短边填满，长边裁切
        const tempImg = new Image();
        tempImg.src = block.imageUrl;
        const natW = tempImg.naturalWidth || w;
        const natH = tempImg.naturalHeight || h;
        const scaleW = w / natW;
        const scaleH = h / natH;
        const scale = Math.max(scaleW, scaleH); // cover 取较大值
        const imgW = natW * scale;
        const imgH = natH * scale;
        const imgX = x + (w - imgW) / 2; // 居中
        const imgY = y + (h - imgH) / 2;

        // 3. 渲染图片，应用 clipPath
        const img = document.createElementNS(svgNS, 'image');
        img.setAttribute('x', String(imgX));
        img.setAttribute('y', String(imgY));
        img.setAttribute('width', String(imgW));
        img.setAttribute('height', String(imgH));
        img.setAttribute('href', block.imageUrl);
        img.setAttribute('clip-path', `url(#${clipId})`);
        img.setAttribute('preserveAspectRatio', 'none'); // 尺寸已手动计算，关闭自动缩放
        svg.appendChild(img);
      }

      if (!block.imageUrl) {
        // 文字裁切区域，防止溢出 block 边界
        const overflowMode = block.overflowMode || (isTextLayer ? 'visible' : 'clip');
        const textClipId = `textclip-${block.id}`;
        if (overflowMode !== 'visible') {
          const textDefs = document.createElementNS(svgNS, 'defs');
          const textClip = document.createElementNS(svgNS, 'clipPath');
          textClip.setAttribute('id', textClipId);
          const textClipRect = document.createElementNS(svgNS, 'rect');
          textClipRect.setAttribute('x', String(x + 4));
          textClipRect.setAttribute('y', String(y + 4));
          textClipRect.setAttribute('width', String(w - 8));
          textClipRect.setAttribute('height', String(h - 8));
          textClip.appendChild(textClipRect);
          textDefs.appendChild(textClip);
          svg.appendChild(textDefs);
        }

        // 读取 block 的排版属性
        const fontSize = block.fontSize || 13;
        const fontFamily = block.fontFamily || 'monospace';
        const fontWeight = block.fontWeight === 'black' ? 900 
          : block.fontWeight === 'bold' ? 700 : 400;
        const textAnchor = block.textAlign === 'right' ? 'end'
          : block.textAlign === 'center' ? 'middle' : 'start';
        const padding = block.padding ?? 8;
        const textX = block.textAlign === 'right' ? x + w - padding
          : block.textAlign === 'center' ? x + w / 2
          : x + padding;

        // 处理自动换行：monospace 字体每字符约 0.62em，serif/sans 约 0.52em
        const charWidth = (block.fontFamily || 'monospace').includes('mono') 
          ? fontSize * 0.62 
          : fontSize * 0.52;
        const charsPerLine = Math.floor((w - (padding * 2)) / charWidth);
        const rawText = block.label || '';
        
        // 先按换行符分段，再对每段做自动换行
        const paragraphs = rawText.split('\n');
        const lines: string[] = [];
        for (const para of paragraphs) {
          if (para.length === 0) {
            lines.push('');
            continue;
          }
          const words = para.split(' ');
          let currentLine = '';
          for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            if (testLine.length > charsPerLine && currentLine) {
              lines.push(currentLine);
              currentLine = word;
            } else {
              currentLine = testLine;
            }
          }
          if (currentLine) lines.push(currentLine);
        }

        const lineHeight = fontSize * 1.4;
        const visibleLines = block.lineClamp ? lines.slice(0, block.lineClamp) : lines;
        const totalTextHeight = visibleLines.length * lineHeight;
        
        // 垂直起始位置：title 居中，其他贴顶
        const startY = block.type === 'title'
          ? y + (h - totalTextHeight) / 2 + fontSize
          : y + padding + fontSize;

        // 用 <text> + 多个 <tspan> 实现多行
        const textEl = document.createElementNS(svgNS, 'text');
        textEl.setAttribute('font-family', fontFamily);
        textEl.setAttribute('font-size', String(fontSize));
        textEl.setAttribute('font-weight', String(fontWeight));
        textEl.setAttribute('font-style', block.fontStyle || 'normal');
        textEl.setAttribute('fill', block.textColor || '#111111');
        textEl.setAttribute('text-anchor', textAnchor);
        textEl.setAttribute('x', String(textX));
        textEl.setAttribute('y', String(startY));
        if (overflowMode !== 'visible') {
          textEl.setAttribute('clip-path', `url(#${textClipId})`);
        }

        visibleLines.forEach((line, i) => {
          const tspan = document.createElementNS(svgNS, 'tspan');
          tspan.setAttribute('x', String(textX));
          tspan.setAttribute('dy', i === 0 ? '0' : String(lineHeight));
          tspan.textContent = line || ' '; // 空行用空格占位
          textEl.appendChild(tspan);
        });

        svg.appendChild(textEl);
      }
    });
    return svg.outerHTML;
  };

  const exportSVG = () => {
    const blob = new Blob([buildLayoutSvgMarkup()], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `gridsys_layout_${canvasViewportLabel.toLowerCase()}.svg`; a.click();
    URL.revokeObjectURL(url);
  };

  const waitForPaint = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

  const waitForBoardImages = async (node: HTMLElement) => {
    const images = Array.from(node.querySelectorAll('img'));
    await Promise.all(images.map(async image => {
      if (!image.complete || image.naturalWidth === 0) {
        await new Promise<void>(resolve => {
          image.addEventListener('load', () => resolve(), { once: true });
          image.addEventListener('error', () => resolve(), { once: true });
        });
      }
      if ('decode' in image && image.complete && image.naturalWidth > 0) {
        await image.decode().catch(() => undefined);
      }
    }));
  };

  const captureCurrentBoardJpeg = async () => {
    const node = boardCaptureRef.current;
    if (!node) {
      throw new Error(language === 'zh' ? '当前画布还没有准备好。' : 'The canvas is not ready yet.');
    }

    const previousSelectedId = selectedId;
    const previousSelectedIds = selectedIds;
    setSelectedId(null);
    setSelectedIds([]);
    setSelectionBox(null);

    try {
      await waitForPaint();
      await waitForPaint();
      await waitForBoardImages(node);
      await waitForPaint();
      const canvas = await html2canvas(node, {
        backgroundColor: '#ffffff',
        scale: 2,
        width: canvasSize.width,
        height: canvasSize.height,
        windowWidth: canvasSize.width,
        windowHeight: canvasSize.height,
        useCORS: true,
        allowTaint: true,
        imageTimeout: 15000,
        ignoreElements: element => {
          return element instanceof HTMLElement && element.dataset.aiCaptureIgnore === 'true';
        },
        onclone: (_document, clonedElement) => {
          const clonedNode = clonedElement as HTMLElement;
          clonedNode.style.transform = 'none';
          clonedNode.style.transformOrigin = 'top left';
          clonedNode.style.boxShadow = 'none';
        }
      });
      return canvas.toDataURL('image/jpeg', 0.95);
    } finally {
      setSelectedId(previousSelectedId);
      setSelectedIds(previousSelectedIds);
    }
  };

  const closeAiConfirm = () => {
    setAiConfirmOpen(false);
    setAiPendingBoardImage(null);
  };

  const openAiPreviewConfirm = async () => {
    setAiGenerationError(null);
    setAiPreviewImage(null);
    setAiPreparingPreview(true);

    try {
      const boardImage = await captureCurrentBoardJpeg();
      setAiPendingBoardImage(boardImage);
      setAiConfirmOpen(true);
    } catch (error) {
      setAiGenerationError(error instanceof Error ? error.message : 'Failed to capture canvas preview.');
    } finally {
      setAiPreparingPreview(false);
    }
  };

  const startAiPreviewGeneration = async () => {
    setAiConfirmOpen(false);
    setAiGenerationError(null);
    setAiPreviewImage(null);
    setAiGenerating(true);
    setIsLocked(true);

    try {
      const boardImage = aiPendingBoardImage;
      if (!boardImage) {
        throw new Error(language === 'zh' ? '缺少将发送给 AI 的画板截图，请重新点击 AI 预览生成。' : 'Missing canvas capture. Please start AI preview again.');
      }
      const response = await fetch('/api/generate-ai-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boardImage,
          canvas: {
            width: canvasSize.width,
            height: canvasSize.height,
            label: canvasViewportLabel
          }
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || 'AI preview generation failed.');
      }
      if (!result.imageUrl) {
        throw new Error('AI did not return an image.');
      }
      setAiPreviewImage(result.imageUrl);
    } catch (error) {
      setAiGenerationError(error instanceof Error ? error.message : 'AI preview generation failed.');
      setIsLocked(false);
    } finally {
      setAiPendingBoardImage(null);
      setAiGenerating(false);
    }
  };

  const exitAiPreview = () => {
    setAiPreviewImage(null);
    setAiPendingBoardImage(null);
    setAiGenerationError(null);
    setIsLocked(false);
  };

  const downloadAiPreviewJpg = async () => {
    if (!aiPreviewImage) return;
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Unable to prepare image download.'));
      img.src = aiPreviewImage;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/jpeg', 0.95);
    link.download = `gridsys_ai_preview_${Date.now()}.jpg`;
    link.click();
  };

  const handleZoom = (delta: number) => {
    setZoom(prev => Math.min(Math.max(prev + delta, 0.4), 1.5));
  };

  const handleImageAssetUpload = (files: FileList | File[], forcedRole?: ImageAssetRole) => {
    const nextFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    nextFiles.slice(0, Math.max(0, 24 - imageAssets.length)).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        const image = new Image();
        image.onload = () => {
          setImageAssets(prev => [
            ...prev,
            {
              id: createLocalId(),
              name: file.name.replace(/\.[^.]+$/, ''),
              dataUrl,
              role: forcedRole || (prev.length === 0 ? 'hero_image' : 'supporting_image'),
              width: image.naturalWidth,
              height: image.naturalHeight
            }
          ]);
        };
        image.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
  };

  const addTextAsset = () => {
    const content = newTextAsset.trim();
    if (!content) return;
    setTextAssets(prev => [
      ...prev,
      {
        id: createLocalId(),
        label: `${newTextRole.toUpperCase()} ${prev.length + 1}`,
        content,
        role: newTextRole
      }
    ]);
    setNewTextAsset('');
  };

  const renderAssetsPanel = () => (
    <CollapsibleSection
      title={t.assets}
      icon={<ImageIcon size={13} />}
      collapsed={collapsedSections.assets}
      onToggle={() => toggleSection('assets')}
      meta={`${textAssets.length} TXT / ${imageAssets.filter(asset => asset.role !== 'reference').length} IMG`}
    >
      <div>
        <div className="mb-2">
          <span className="block text-[9px] font-black uppercase tracking-widest text-swiss-black/55">{t.useTextAssets}</span>
          <span className="block mt-1 text-[9px] leading-tight text-swiss-black/35">
            {language === 'zh' ? '先添加文字。body 会按正文文本顺序进入模板；title 会优先进入标题位。' : 'Add text first. Body fills text slots in order; title fills the title slot first.'}
          </span>
        </div>
        <div className="grid grid-cols-5 gap-1 mb-2">
          {(['title', 'subtitle', 'body', 'caption', 'label'] as TextAssetRole[]).map(role => (
            <button
              key={role}
              onClick={() => setNewTextRole(role)}
              className={`h-7 text-[8px] font-black uppercase border transition-colors ${
                newTextRole === role
                  ? 'bg-swiss-black text-white border-swiss-black'
                  : 'bg-white/50 border-swiss-black/10 text-swiss-black/45 hover:text-swiss-red hover:border-swiss-red'
              }`}
            >
              {role}
            </button>
          ))}
        </div>
        <textarea
          value={newTextAsset}
          onChange={(event) => setNewTextAsset(event.target.value)}
          placeholder={language === 'zh' ? '粘贴标题、正文、说明文字...' : 'Paste titles, body copy, captions...'}
          className="w-full h-20 resize-none bg-white/70 border border-swiss-black/10 p-2 text-[11px] leading-snug outline-none focus:border-swiss-red placeholder:text-swiss-black/25"
        />
        <button
          onClick={addTextAsset}
          disabled={!newTextAsset.trim()}
          className="mt-2 w-full h-8 bg-swiss-black text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:bg-swiss-red transition-colors"
        >
          {t.addText}
        </button>
        <div className="mt-3 space-y-2">
          {textAssets.map(asset => (
            <div key={asset.id} className="group border border-swiss-black/10 bg-white/60 p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[8px] font-black uppercase tracking-widest text-swiss-red">{asset.role}</span>
                <button
                  onClick={() => setTextAssets(prev => prev.filter(item => item.id !== asset.id))}
                  className="text-swiss-black/25 hover:text-swiss-red"
                  title={language === 'zh' ? '移除文字' : 'Remove text'}
                >
                  <X size={12} />
                </button>
              </div>
              <p className="text-[10px] leading-snug text-swiss-black/70 line-clamp-3 whitespace-pre-wrap">{asset.content}</p>
            </div>
          ))}
        </div>
        <button
          onClick={randomAssignTextToBlocks}
          disabled={textAssets.length === 0 || !activeTemplate}
          className="mt-3 w-full h-9 bg-white border border-swiss-black/10 text-[10px] font-black uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:border-swiss-red hover:text-swiss-red transition-colors"
        >
          {language === 'zh' ? '按模板分配文字' : 'Assign Text by Template'}
        </button>
      </div>

      <div className="mt-4 border-t border-swiss-black/10 pt-3">
        <button
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.multiple = true;
            input.onchange = (event) => handleImageAssetUpload((event.target as HTMLInputElement).files || []);
            input.click();
          }}
          className="w-full h-10 border border-dashed border-swiss-black/25 bg-white/50 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest hover:border-swiss-red hover:text-swiss-red transition-colors"
        >
          <Upload size={13} />
          {t.uploadImages}
        </button>
        <div className="grid grid-cols-3 gap-2 mt-3">
          {imageAssets.filter(asset => asset.role !== 'reference').map(asset => (
            <div key={asset.id} className="relative group bg-white border border-swiss-black/10">
              <img src={asset.dataUrl} alt={asset.name} className="aspect-square w-full object-cover" />
              <button
                onClick={() => setImageAssets(prev => prev.filter(item => item.id !== asset.id))}
                className="absolute top-1 right-1 w-5 h-5 bg-swiss-red text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                title={language === 'zh' ? '移除图片' : 'Remove image'}
              >
                <X size={12} />
              </button>
              <select
                value={asset.role}
                onChange={(event) => setImageAssets(prev => prev.map(item => (
                  item.id === asset.id ? { ...item, role: event.target.value as ImageAssetRole } : item
                )))}
                className="absolute left-1 bottom-1 max-w-[calc(100%-8px)] bg-white/90 border border-swiss-black/15 text-[8px] font-black uppercase outline-none"
                title="Image role"
              >
                {IMAGE_ROLE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <button
          onClick={randomAssignImagesToBlocks}
          disabled={imageAssets.filter(asset => asset.role !== 'reference').length === 0 || !activeTemplate}
          className="mt-3 w-full h-9 bg-white border border-swiss-black/10 text-[10px] font-black uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:border-swiss-red hover:text-swiss-red transition-colors"
        >
          {language === 'zh' ? '按尺寸分配图片' : 'Assign Images by Size'}
        </button>
      </div>
    </CollapsibleSection>
  );

  const renderLocalAssignmentPanel = () => (
    <CollapsibleSection
      title={language === 'zh' ? '3. 本地分配' : '3. Local Assignment'}
      icon={<Shuffle size={13} />}
      collapsed={collapsedSections.ai}
      onToggle={() => toggleSection('ai')}
      meta="LOCAL"
    >
      <div className="border border-swiss-black/10 bg-white/60 p-3">
        <p className="text-[10px] leading-snug text-swiss-black/55">
          {language === 'zh'
            ? '上传素材后可随机填入，也可以把当前页面区块在同类槽位之间随机重排。'
            : 'Upload assets to fill slots, or shuffle current page sections across compatible slots.'}
        </p>
        <button
          onClick={randomAssignAllAssets}
          disabled={
            !activeTemplate ||
            (imageAssets.filter(asset => asset.role !== 'reference').length === 0 && textAssets.length === 0 && blocks.length === 0)
          }
          className="mt-3 w-full h-9 bg-swiss-black text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:bg-swiss-red transition-colors"
        >
          {language === 'zh' ? '随机分配并重排' : 'Random Assign + Shuffle'}
        </button>
        <button
          onClick={randomizeCurrentLayout}
          disabled={!activeTemplate || blocks.length === 0}
          className="mt-2 w-full h-9 bg-white border border-swiss-black/10 text-[10px] font-black uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:border-swiss-red hover:text-swiss-red transition-colors"
        >
          {language === 'zh' ? '只随机重排版面' : 'Shuffle Layout Only'}
        </button>
      </div>
    </CollapsibleSection>
  );

  return (
    <div className="flex h-screen w-screen bg-swiss-grey-base text-swiss-black overflow-hidden select-none">
      {/* Top Bar */}
      <nav className="fixed top-0 left-0 right-0 h-[52px] bg-[#111] border-b border-[#333] text-white grid grid-cols-[1fr_auto_1fr] items-center px-6 z-50">
        <div className="flex items-center gap-5 min-w-0 justify-self-start">
          <div className="flex items-center gap-2">
            <span className="font-black text-base tracking-widest uppercase">Grid.sys</span>
            <span className="bg-swiss-red text-white px-1.5 py-0.5 rounded-[2px] text-[10px] font-bold">V2.4</span>
          </div>
          
          <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-wider text-white/70">
            <button
              onClick={undo}
              disabled={history.length === 0}
              className="flex items-center gap-1 hover:text-swiss-red disabled:opacity-25 disabled:hover:text-white/70 transition-colors"
              title="撤回上一步"
            >
              <Undo2 size={13} strokeWidth={3} />
              {t.undo}
            </button>
            <button
              onClick={redo}
              disabled={future.length === 0}
              className="flex items-center gap-1 hover:text-swiss-red disabled:opacity-25 disabled:hover:text-white/70 transition-colors"
              title="重做下一步"
            >
              <Redo2 size={13} strokeWidth={3} />
              {t.redo}
            </button>
            <button
              onClick={resetCanvas}
              className="flex items-center gap-1 hover:text-swiss-red transition-colors"
              title={language === 'zh' ? '重置为空白画布' : 'Reset to blank canvas'}
            >
              <RotateCcw size={13} strokeWidth={3} />
              {t.reset}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-white/70 justify-self-center">
          <span className="hidden xl:inline">{t.viewport}: {canvasViewportLabel}</span>
          <div className="flex border border-white/15 bg-white/5">
            {CANVAS_PRESETS.map(preset => (
              <button
                key={preset.id}
                onClick={() => selectCanvasPreset(preset)}
                className={`px-2.5 py-1 text-[10px] font-black font-mono transition-colors ${
                  canvasPresetId === preset.id
                    ? 'bg-swiss-red text-white'
                    : 'text-white/55 hover:text-white hover:bg-white/10'
                }`}
                title={`${preset.viewportLabel} ${preset.width}x${preset.height}px`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="flex border border-white/15 bg-white/5">
            {[
              { value: 'landscape' as const, label: 'H' },
              { value: 'portrait' as const, label: 'V' },
            ].map(option => (
              <button
                key={option.value}
                onClick={() => setCanvasOrientation(option.value)}
                className={`px-2 py-1 text-[10px] font-black font-mono transition-colors ${
                  canvasOrientation === option.value
                    ? 'bg-swiss-red text-white'
                    : 'text-white/55 hover:text-white hover:bg-white/10'
                }`}
                title={option.value === 'landscape' ? (language === 'zh' ? '横放' : 'Landscape') : (language === 'zh' ? '竖放' : 'Portrait')}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-5 text-[11px] font-bold uppercase tracking-wider text-white/50 justify-self-end">
          <div className="flex items-center gap-3 text-white/70">
            <button 
              onClick={() => handleZoom(-0.05)}
              className="hover:text-swiss-red transition-colors"
              title={language === 'zh' ? '缩小' : 'Zoom out'}
            >
              <Minus size={12} strokeWidth={4} />
            </button>
            <span className="font-mono tabular-nums min-w-[68px] text-center">
              {Math.round(zoom * 100)}% {t.scale}
            </span>
            <button 
              onClick={() => handleZoom(0.05)}
              className="hover:text-swiss-red transition-colors"
              title={language === 'zh' ? '放大' : 'Zoom in'}
            >
              <Plus size={12} strokeWidth={4} />
            </button>
            <button
              onClick={fitCanvasToViewport}
              className="px-2 py-1 border border-white/15 text-white/60 hover:text-white hover:border-swiss-red transition-colors"
              title="Fit canvas to screen"
            >
              {t.fit}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span>{t.visibility}</span>
            <div 
              onClick={() => setShowGrid(!showGrid)}
              className="w-9 h-4.5 bg-[#333] border border-[#444] relative cursor-pointer"
              title={language === 'zh' ? '显示/隐藏模板网格' : 'Show or hide template grid'}
            >
              <motion.div 
                animate={{ left: showGrid ? '20px' : '2px' }}
                className="absolute top-[2px] w-3 h-3 bg-swiss-red" 
              />
            </div>
            <span className="text-white/35">BASE</span>
            <div 
              onClick={() => setShowBaseline(!showBaseline)}
              className="w-9 h-4.5 bg-[#333] border border-[#444] relative cursor-pointer"
              title={language === 'zh' ? '显示/隐藏灰色基线' : 'Show or hide gray baseline'}
            >
              <motion.div 
                animate={{ left: showBaseline ? '20px' : '2px' }}
                className="absolute top-[2px] w-3 h-3 bg-white/70" 
              />
            </div>
          </div>
          <button
            onClick={() => setShowGuide(true)}
            className="flex items-center gap-1 text-white/60 hover:text-white transition-colors"
            title={language === 'zh' ? '新手导航' : 'Guide'}
          >
            <HelpCircle size={14} />
            {t.guide}
          </button>

          <div className="flex border border-white/15 bg-white/5">
            {(['zh', 'en'] as Language[]).map(option => (
              <button
                key={option}
                onClick={() => setLanguage(option)}
                className={`px-2 py-1 text-[10px] font-black transition-colors ${
                  language === option ? 'bg-white text-[#111]' : 'text-white/55 hover:text-white'
                }`}
              >
                {option === 'zh' ? '中文' : 'EN'}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Sidebar Left: Guided Workflow */}
      <aside className="fixed left-0 top-[52px] bottom-0 w-[300px] glass-panel z-40 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-swiss-black/5 bg-white/60">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] font-extrabold uppercase tracking-widest text-swiss-black/45">{t.workflow}</h2>
            <Search size={14} className="opacity-30" />
          </div>
          <div className="grid grid-cols-2 gap-1">
            {[
              { value: 'generate' as const, label: t.aiGenerate },
              { value: 'edit' as const, label: t.freeEdit },
            ].map(mode => (
              <button
                key={mode.value}
                onClick={() => {
                  setSidebarMode(mode.value);
                  if (mode.value === 'edit') {
                    setLayoutMode('editorial');
                  }
                }}
                className={`h-8 text-[10px] font-black uppercase tracking-widest border transition-colors ${
                  sidebarMode === mode.value
                    ? 'bg-swiss-black text-white border-swiss-black'
                    : 'bg-white/70 text-swiss-black/45 border-swiss-black/10 hover:border-swiss-red hover:text-swiss-red'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-24 scrollbar-hide space-y-4">
          {sidebarMode === 'generate' ? (
            <>
              <CollapsibleSection
                title={t.reference}
                icon={<LayoutGrid size={13} />}
                collapsed={collapsedSections.pageType}
                onToggle={() => toggleSection('pageType')}
                meta={referenceMode === 'template' ? t.template : t.ownReference}
              >
                <div className="grid grid-cols-2 gap-1 mb-3">
                  {[
                    { value: 'template' as const, label: t.template, help: t.templateHelp },
                    { value: 'upload' as const, label: t.ownReference, help: t.ownReferenceHelp },
                  ].map(option => (
                    <button
                      key={option.value}
                      onClick={() => setReferenceMode(option.value)}
                      className={`min-h-12 border p-2 text-left transition-colors ${
                        referenceMode === option.value
                          ? 'bg-swiss-red text-white border-swiss-red'
                          : 'bg-white/60 text-swiss-black border-swiss-black/10 hover:border-swiss-red'
                      }`}
                    >
                      <span className="block text-[10px] font-black uppercase tracking-widest">{option.label}</span>
                      <span className={`block mt-1 text-[8px] leading-tight ${
                        referenceMode === option.value ? 'text-white/75' : 'text-swiss-black/35'
                      }`}>
                        {option.help}
                      </span>
                    </button>
                  ))}
                </div>

                {referenceMode === 'template' ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      {availableTemplates.map((template, index) => {
                        const isActive = activeTemplateId === template.templateMeta.templateId;
                        const templateGrid = getTemplateGridSpec(template, 'a3');
                        return (
                          <button
                            key={template.templateMeta.templateId}
                            onClick={() => {
                              setReferenceMode('template');
                              loadTemplateBlocks(template);
                            }}
                            className={`aspect-[4/3] border flex items-center justify-center transition-colors ${
                              isActive
                                ? 'border-swiss-red bg-white cursor-pointer hover:bg-swiss-red/[0.06]'
                                : 'border-swiss-black/15 bg-white/55 cursor-pointer hover:border-swiss-red hover:bg-white'
                            }`}
                          >
                            <div className="w-full h-full p-2 flex flex-col justify-between text-left">
                              <div>
                                <span className={`block text-[8px] font-black uppercase tracking-widest ${isActive ? 'text-swiss-red' : 'text-swiss-black/35'}`}>
                                  {isActive ? 'ACTIVE A3' : 'A3'}
                                </span>
                                <span className="block mt-1 text-[10px] font-black uppercase leading-tight text-swiss-black">
                                  {language === 'zh' ? `A3 模板 ${index + 1}` : `A3 Template ${index + 1}`}
                                </span>
                                <span className="block mt-1 text-[8px] font-bold leading-tight text-swiss-black/35">
                                  {template.templateMeta.templateName}
                                </span>
                              </div>
                              <div className="font-mono text-[8px] font-bold uppercase text-swiss-black/35">
                                {templateGrid.columns}x{templateGrid.rows} / M{Number(templateGrid.margin).toFixed(templateGrid.margin % 1 ? 2 : 0)} / B{templateGrid.baseline}
                              </div>
                              <span className="block text-[8px] font-black uppercase tracking-widest text-swiss-black/40">
                                {language === 'zh' ? '点击切换模板' : 'Click to switch'}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                      {[...Array(Math.max(0, 2 - availableTemplates.length))].map((_, index) => (
                        <div
                          key={`template-empty-${index}`}
                          className="aspect-[4/3] border border-dashed border-swiss-black/15 bg-white/45 flex items-center justify-center"
                        >
                          <span className="text-[8px] font-black uppercase tracking-widest text-swiss-black/25">
                            Template {String(index + availableTemplates.length + 1).padStart(2, '0')}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="border border-swiss-black/10 bg-white/60 p-2 text-[9px] leading-snug text-swiss-black/40">
                      {language === 'zh'
                        ? 'A3 模板 1 和 A3 模板 2 都已接入网页。点击模板会切换画布结构；切到自由编辑不会清空当前内容。'
                        : 'A3 Template 1 and 2 are available. Clicking a template switches the canvas structure; Free Edit keeps current content.'}
                    </div>
                  </div>
                ) : (
                  <div className="border-t border-swiss-black/10 pt-3">
                    <button
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/*';
                        input.multiple = true;
                        input.onchange = (event) => {
                          handleImageAssetUpload((event.target as HTMLInputElement).files || [], 'reference');
                        };
                        input.click();
                      }}
                      className="w-full h-10 border border-dashed border-swiss-black/25 bg-white/50 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest hover:border-swiss-red hover:text-swiss-red transition-colors"
                    >
                      <Upload size={13} />
                      {t.uploadReference}
                    </button>
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      {imageAssets.filter(asset => asset.role === 'reference').map(asset => (
                        <div key={asset.id} className="relative group bg-white border border-swiss-black/10">
                          <img src={asset.dataUrl} alt={asset.name} className="aspect-square w-full object-cover" />
                          <button
                            onClick={() => {
                              setImageAssets(prev => prev.filter(item => item.id !== asset.id));
                            }}
                            className="absolute top-1 right-1 w-5 h-5 bg-swiss-red text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                            title={language === 'zh' ? '移除参考图' : 'Remove reference'}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 border border-dashed border-swiss-black/15 bg-white/45 p-2 text-[9px] leading-snug text-swiss-black/40">
                      {language === 'zh'
                        ? '参考图会保留在这里，后续可手动对照调整版面。'
                        : 'Reference images stay here for manual layout comparison.'}
                    </div>
                    <div className="mt-2 border border-swiss-black/10 bg-white/50 p-2 text-[9px] leading-snug text-swiss-black/35">
                      {language === 'zh'
                        ? '这里仅保存参考图；当前模板区先留空等待新的 A3 模板缩略图。'
                        : 'This area only stores reference images; template slots remain reserved for the new A3 thumbnails.'}
                    </div>
                  </div>
                )}
              </CollapsibleSection>

              <CollapsibleSection
                title={t.assets}
                icon={<ImageIcon size={13} />}
                collapsed={collapsedSections.assets}
                onToggle={() => toggleSection('assets')}
                meta={`${textAssets.length} TXT / ${imageAssets.filter(asset => asset.role !== 'reference').length} IMG`}
              >
                <div>
                  <div className="mb-2">
                    <span className="block text-[9px] font-black uppercase tracking-widest text-swiss-black/55">{t.useTextAssets}</span>
                    <span className="block mt-1 text-[9px] leading-tight text-swiss-black/35">
                      {language === 'zh' ? '先添加文字。body 会按正文文本 1、正文文本 2 的顺序进入模板；title 会优先进入标题位。' : 'Add text first. Body fills text slot 1 then 2; title fills the title slot first.'}
                    </span>
                  </div>
                  <div>
                      <div className="grid grid-cols-5 gap-1 mb-2">
                        {(['title', 'subtitle', 'body', 'caption', 'label'] as TextAssetRole[]).map(role => (
                          <button
                            key={role}
                            onClick={() => setNewTextRole(role)}
                            className={`h-7 text-[8px] font-black uppercase border transition-colors ${
                              newTextRole === role
                                ? 'bg-swiss-black text-white border-swiss-black'
                                : 'bg-white/50 border-swiss-black/10 text-swiss-black/45 hover:text-swiss-red hover:border-swiss-red'
                            }`}
                          >
                            {role}
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={newTextAsset}
                        onChange={(event) => setNewTextAsset(event.target.value)}
                        placeholder={language === 'zh' ? '粘贴标题、正文、说明文字...' : 'Paste titles, body copy, captions...'}
                        className="w-full h-20 resize-none bg-white/70 border border-swiss-black/10 p-2 text-[11px] leading-snug outline-none focus:border-swiss-red placeholder:text-swiss-black/25"
                      />
                      <button
                        onClick={addTextAsset}
                        disabled={!newTextAsset.trim()}
                        className="mt-2 w-full h-8 bg-swiss-black text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:bg-swiss-red transition-colors"
                      >
                        {t.addText}
                      </button>
	                      <div className="mt-3 space-y-2">
	                        {textAssets.map(asset => (
                          <div key={asset.id} className="group border border-swiss-black/10 bg-white/60 p-2">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[8px] font-black uppercase tracking-widest text-swiss-red">{asset.role}</span>
                              <button
                                onClick={() => setTextAssets(prev => prev.filter(item => item.id !== asset.id))}
                                className="text-swiss-black/25 hover:text-swiss-red"
                                title={language === 'zh' ? '移除文字' : 'Remove text'}
                              >
                                <X size={12} />
                              </button>
                            </div>
                            <p className="text-[10px] leading-snug text-swiss-black/70 line-clamp-3 whitespace-pre-wrap">{asset.content}</p>
	                          </div>
	                        ))}
	                      </div>
	                      <button
	                        onClick={randomAssignTextToBlocks}
	                        disabled={textAssets.length === 0 || !activeTemplate}
	                        className="mt-3 w-full h-9 bg-white border border-swiss-black/10 text-[10px] font-black uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:border-swiss-red hover:text-swiss-red transition-colors"
	                      >
	                        {language === 'zh' ? '按模板分配文字' : 'Assign Text by Template'}
	                      </button>
                </div>
                </div>

                <div className="mt-4 border-t border-swiss-black/10 pt-3">
                  <button
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.multiple = true;
                      input.onchange = (event) => handleImageAssetUpload((event.target as HTMLInputElement).files || []);
                      input.click();
                    }}
                    className="w-full h-10 border border-dashed border-swiss-black/25 bg-white/50 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest hover:border-swiss-red hover:text-swiss-red transition-colors"
                  >
                    <Upload size={13} />
                    {t.uploadImages}
                  </button>
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    {imageAssets.filter(asset => asset.role !== 'reference').map(asset => (
                      <div key={asset.id} className="relative group bg-white border border-swiss-black/10">
                        <img src={asset.dataUrl} alt={asset.name} className="aspect-square w-full object-cover" />
                        <button
                          onClick={() => setImageAssets(prev => prev.filter(item => item.id !== asset.id))}
                          className="absolute top-1 right-1 w-5 h-5 bg-swiss-red text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                          title={language === 'zh' ? '移除图片' : 'Remove image'}
                        >
                          <X size={12} />
                        </button>
                        <select
                          value={asset.role}
                          onChange={(event) => setImageAssets(prev => prev.map(item => (
                            item.id === asset.id ? { ...item, role: event.target.value as ImageAssetRole } : item
                          )))}
                          className="absolute left-1 bottom-1 max-w-[calc(100%-8px)] bg-white/90 border border-swiss-black/15 text-[8px] font-black uppercase outline-none"
                          title="Image role"
                        >
                          {IMAGE_ROLE_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={randomAssignImagesToBlocks}
                    disabled={imageAssets.filter(asset => asset.role !== 'reference').length === 0 || !activeTemplate}
                    className="mt-3 w-full h-9 bg-white border border-swiss-black/10 text-[10px] font-black uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:border-swiss-red hover:text-swiss-red transition-colors"
                  >
                    {language === 'zh' ? '按尺寸分配图片' : 'Assign Images by Size'}
                  </button>
                </div>
              </CollapsibleSection>

              <CollapsibleSection
                title={language === 'zh' ? '3. 本地分配' : '3. Local Assignment'}
                icon={<Shuffle size={13} />}
                collapsed={collapsedSections.ai}
                onToggle={() => toggleSection('ai')}
                meta="LOCAL"
              >
                <div className="border border-swiss-black/10 bg-white/60 p-3">
                  <p className="text-[10px] leading-snug text-swiss-black/55">
                    {language === 'zh'
                      ? '上传素材后可随机填入，也可以把当前页面区块在同类槽位之间随机重排。'
                      : 'Upload assets to fill slots, or shuffle current page sections across compatible slots.'}
                  </p>
                  <button
                    onClick={randomAssignAllAssets}
                    disabled={
                      !activeTemplate ||
                      (imageAssets.filter(asset => asset.role !== 'reference').length === 0 && textAssets.length === 0 && blocks.length === 0)
                    }
                    className="mt-3 w-full h-9 bg-swiss-black text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:bg-swiss-red transition-colors"
                  >
                    {language === 'zh' ? '随机分配并重排' : 'Random Assign + Shuffle'}
                  </button>
                  <button
                    onClick={randomizeCurrentLayout}
                    disabled={!activeTemplate || blocks.length === 0}
                    className="mt-2 w-full h-9 bg-white border border-swiss-black/10 text-[10px] font-black uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:border-swiss-red hover:text-swiss-red transition-colors"
                  >
                    {language === 'zh' ? '只随机重排版面' : 'Shuffle Layout Only'}
                  </button>
                </div>
              </CollapsibleSection>
            </>
          ) : (
            <>
              <CollapsibleSection
                title={t.basicBlocks}
                icon={<Box size={13} />}
                collapsed={collapsedSections.basicBlocks}
                onToggle={() => toggleSection('basicBlocks')}
              >
                <CategorySection
                  title={t.basicBlocks}
                  icon={<Box size={14} />}
                  items={language === 'zh' ? ['文本区块', '图片区块', '空白区块'] : ['Text Block', 'Image Block', 'Blank Block']}
                  onAdd={(item) => {
                    const normalized = language === 'zh'
                      ? ({ '文本区块': 'Text Block', '图片区块': 'Image Block', '空白区块': 'Blank Block' } as Record<string, string>)[item]
                      : item;
                    addBlock(item, 'Generic', normalized === 'Image Block' ? 'image' : normalized === 'Text Block' ? 'text' : 'blank');
                  }}
                />
              </CollapsibleSection>

              {renderAssetsPanel()}

              {renderLocalAssignmentPanel()}

              <CollapsibleSection
                title={t.layoutMode}
                icon={<Layers size={13} />}
                collapsed={collapsedSections.editLayout}
                onToggle={() => toggleSection('editLayout')}
                meta={layoutMode === 'editorial' ? 'FREE' : 'STRICT'}
              >
                <div className="grid grid-cols-2 gap-1">
                  {[
                    { value: 'editorial' as const, label: 'FREE', desc: '允许叠放，推荐' },
                    { value: 'strict' as const, label: 'STRICT', desc: '自动避让' },
                  ].map(option => (
                    <button
                      key={option.value}
                      onClick={() => setLayoutMode(option.value)}
                      className={`min-h-12 border p-2 text-left transition-colors ${
                        layoutMode === option.value
                          ? 'bg-swiss-red text-white border-swiss-red'
                          : 'bg-white/60 text-swiss-black border-swiss-black/10 hover:border-swiss-red'
                      }`}
                    >
                      <span className="block text-[10px] font-black uppercase tracking-widest">{option.label}</span>
                      <span className={`block mt-1 text-[8px] ${layoutMode === option.value ? 'text-white/75' : 'text-swiss-black/35'}`}>
                        {option.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </CollapsibleSection>
            </>
          )}
        </div>
        <div className="absolute left-0 right-0 bottom-0 p-4 bg-white/85 border-t border-swiss-black/10 backdrop-blur">
          <button
            onClick={openAiPreviewConfirm}
            disabled={blocks.length === 0 || aiGenerating || aiPreparingPreview}
            className="w-full h-11 bg-swiss-red text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:bg-swiss-red/85 transition-colors"
          >
            {aiPreparingPreview
              ? (language === 'zh' ? '正在截取画板...' : 'Capturing Canvas...')
              : aiGenerating
              ? (language === 'zh' ? 'AI 正在生成...' : 'AI Generating...')
              : (language === 'zh' ? 'AI 预览生成' : 'AI Preview Generate')}
          </button>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <main 
        ref={workspaceRef}
        className="flex-1 flex items-center justify-center pt-[52px] pl-[300px] pr-[260px] overflow-scroll scrollbar-hide bg-swiss-grey-canvas"
        onMouseDown={() => selectOnly(null)}
      >
        <div 
          style={{
            width: canvasSize.width * zoom,
            height: canvasSize.height * zoom,
          }}
          className="relative flex-shrink-0 transition-[width,height] duration-300 ease-out"
        >
          {/* Frame Workspace */}
          <div 
            ref={boardCaptureRef}
            className={`absolute left-0 top-0 bg-white overflow-hidden transition-all duration-300 ease-out ${
              aiGenerating
                ? 'shadow-[0_0_44px_rgba(255,51,51,0.45)] ring-2 ring-swiss-red/45 animate-pulse'
                : 'shadow-2xl'
            }`}
            style={{
              width: canvasSize.width,
              height: canvasSize.height,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left'
            }}
          >
            <GridView
              showGrid={showGrid}
              showBaseline={showBaseline}
              label={canvasPreset.label}
              size={canvasSize}
              metrics={gridMetrics}
            />
            
            {/* Isolated Safe Area Wrapper: The strict bounding box */}
            <div 
              id="grid-safe-area"
              ref={safeAreaRef}
              className={`absolute z-20 overflow-hidden ${aiGenerating ? 'pointer-events-none' : ''}`}
              onMouseDown={handleSelectionStart}
              style={{ 
                top: `${gridMetrics.margin}px`, 
                left: `${gridMetrics.margin}px`, 
                width: `${gridMetrics.safeAreaWidth}px`,
                height: `${gridMetrics.safeAreaHeight}px`,
                boxSizing: 'border-box'
              }}
            >
              {selectionBox && (
                <div
                  data-ai-capture-ignore="true"
                  className="absolute z-[70] pointer-events-none border border-swiss-red bg-swiss-red/10"
                  style={selectionBox}
                />
              )}
              {blocks.map(block => {
                const isDragging = dragPreview?.id === block.id;
                const isSelected = selectedIds.includes(block.id);
                const isTextLayer = isTextBlock(block.type);
                const blockOverflowMode = block.overflowMode || (isTextLayer ? 'visible' : 'clip');
                const rect = isDragging && !block.frame
                  ? getPixelRect(dragPreview!.x, dragPreview!.y, block.w, block.h, gridMetrics)
                  : getBlockRect(block, gridMetrics);
                const zIndex = isSelected ? (block.zIndex || 1) + 1000 : (block.zIndex || 1);

                return (
                  <div 
                    key={block.id} 
                    style={{
                      position: 'absolute',
                      zIndex,
                      left: rect.left,
                      top: rect.top,
                      width: rect.width,
                      minHeight: rect.height,
                      height: blockOverflowMode === 'autoHeight' && isTextLayer ? 'auto' : rect.height,
                      transition: isDragging ? 'none' : 'left 150ms ease, top 150ms ease, width 150ms ease, height 150ms ease'
                    }}
                    className="relative group"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.files?.[0]) {
                        handleFileUpload(block.id, e.dataTransfer.files[0]);
                      }
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      if (isInteractiveTarget(e.target)) return;
                      handleDragStart(e, block.id);
                    }}
                  >
                    <div
                      className={`absolute inset-0 flex flex-col transition-all duration-300 ${
                        blockOverflowMode === 'visible' ? 'overflow-visible' : 'overflow-hidden'
                      } ${
                        isTextLayer
                          ? isSelected
                            ? 'border border-swiss-red ring-2 ring-swiss-red ring-offset-2 ring-offset-white'
                            : 'border border-transparent group-hover:border-swiss-red/30'
                          : isSelected
                            ? 'bg-swiss-red text-white border border-swiss-red shadow-xl ring-2 ring-swiss-red ring-offset-2 ring-offset-white'
                            : block.generatedByAI && block.type === 'image'
                              ? 'bg-[#e8f2ff] border border-[#2f80ed]/40 text-[#0b3a66] shadow-sm'
                              : block.type === 'blank'
                                ? 'bg-white/20 border border-dashed border-swiss-black/20 text-swiss-black/20 shadow-none'
                                : 'bg-white border border-swiss-black/10 text-swiss-black shadow-sm'
                      }`}
                      style={{
                        backgroundColor: !isSelected && block.backgroundColor && block.backgroundColor !== 'transparent'
                          ? block.backgroundColor
                          : isTextLayer
                            ? 'transparent'
                            : undefined
                      }}
                    >
                      {/* Image Render Layer */}
                      {block.imageUrl ? (
                        <div className="absolute inset-0 z-0 overflow-hidden">
                          <img 
                            src={block.imageUrl} 
                            alt={block.label}
                            className="w-full h-full pointer-events-none"
                            style={{
                              objectFit: block.imageFit || 'cover',
                              transform: `
                                scale(${block.imageZoom || 1})
                                translate(${block.imagePanX || 0}px, ${block.imagePanY || 0}px)
                                rotate(${block.imageRotation || 0}deg)
                                scaleX(${block.imageFlipX ? -1 : 1})
                                scaleY(${block.imageFlipY ? -1 : 1})
                              `,
                              transition: 'transform 0.2s ease-out'
                            }}
                          />
                          {isSelected && <div className="absolute inset-0 bg-swiss-red/60" />}
                        </div>
                      ) : (
                        block.type === 'image' && (
                          <div className="flex-1 flex flex-col items-center justify-center opacity-20 border-2 border-dashed border-current m-4">
                            <Upload size={32} />
                            <span className="text-[10px] font-bold mt-2 uppercase tracking-tighter italic">Drop Image Here</span>
                          </div>
                        )
                      )}

                      {/* Content Layer */}
                      <div className={`relative z-10 flex flex-col h-full justify-between transition-opacity duration-300 ${
                        block.imageUrl ? 'opacity-0' : 'opacity-100'
                      } ${isTextLayer ? '' : (block.w === 1 || block.h === 1 ? 'p-1.5' : 'p-4')}`}>
                        {/* Drag Handle & Label */}
                        {block.type !== 'title' && (
                          <div className={`transition-opacity duration-150 ${
                            isSelected ? 'opacity-100' : 'opacity-0'
                          } flex items-center justify-between pr-4 ${isTextLayer ? 'absolute -top-5 left-0 right-0 text-swiss-red' : ''}`}>
                            <div className="flex-1 flex items-center gap-2 cursor-move min-w-0">
                              <span className={`${block.w === 1 || block.h === 1 ? 'text-[6px]' : 'text-[10px]'} font-mono font-bold tracking-tight uppercase truncate ${isSelected ? 'text-white' : 'opacity-40'}`}>
                                {block.category} [{block.w}x{block.h}] Z:{block.zIndex || 1}
                              </span>
                              <div className={`${block.w === 1 || block.h === 1 ? 'w-1 h-1' : 'w-2 h-2'} rounded-full flex-shrink-0 ${isSelected ? 'bg-white' : 'bg-swiss-red'}`} />
                            </div>
                          </div>
                        )}
                        
                        <div className={`flex-1 flex flex-col ${isTextLayer ? 'items-start justify-start' : 'items-center justify-center'} ${
                          blockOverflowMode === 'visible' ? 'overflow-visible' : 'overflow-hidden'
                        } relative`}>
                          {block.type === 'title' ? (
                            <div
                              className={`${blockOverflowMode === 'autoHeight' ? 'relative' : 'absolute inset-0'} flex items-start justify-start`}
                              style={{ padding: block.padding ?? 8 }}
                            >
                              {isSelected ? (
                                <textarea
                                  value={block.label}
                                  onChange={(e) => updateBlock(block.id, { label: e.target.value })}
                                  placeholder="TITLE..."
                                  style={{ 
                                    fontFamily: block.fontFamily || 'monospace',
                                    fontWeight: block.fontWeight === 'black' ? 900 : block.fontWeight === 'bold' ? 700 : 400,
                                    fontStyle: block.fontStyle || 'normal',
                                    fontSize: `${block.fontSize || 32}px`,
                                    textAlign: block.textAlign || 'left',
                                    color: block.textColor || 'inherit',
                                  }}
                                  className={`w-full bg-transparent border-none resize-none outline-none text-left leading-tight tracking-tighter uppercase placeholder:text-current placeholder:opacity-20 scrollbar-hide cursor-text ${
                                    blockOverflowMode === 'autoHeight' ? 'min-h-[44px] overflow-visible' : 'h-full'
                                  }`}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => e.stopPropagation()}
                                  onFocus={() => {
                                    if (block.label === 'TITLE BLOCK') updateBlock(block.id, { label: '' }, true);
                                  }}
                                />
                              ) : (
                                <div
                                  className={`w-full leading-tight tracking-tighter uppercase whitespace-pre-wrap break-words ${
                                    blockOverflowMode === 'visible' ? 'overflow-visible' : 'overflow-hidden'
                                  }`}
                                  style={{
                                    fontFamily: block.fontFamily || 'monospace',
                                    fontWeight: block.fontWeight === 'black' ? 900 : block.fontWeight === 'bold' ? 700 : 400,
                                    fontStyle: block.fontStyle || 'normal',
                                    fontSize: `${block.fontSize || 32}px`,
                                    textAlign: block.textAlign || 'left',
                                    color: block.textColor || 'inherit',
                                  }}
                                >
                                  {block.label}
                                </div>
                              )}
                            </div>
                          ) : block.type === 'text' || block.type === 'heading' ? (
                            <EditableTextBlock block={block} isSelected={isSelected} updateBlock={updateBlock} />
                          ) : block.type === 'blank' ? (
                            <span className="text-[9px] font-mono font-bold uppercase tracking-widest opacity-50">Blank</span>
                          ) : (
                            <span className={`text-center font-black ${block.w === 1 || block.h === 1 ? 'text-[8px]' : 'text-lg'} tracking-tighter uppercase leading-tight px-1 break-words drop-shadow-sm`}>
                              {block.label}
                            </span>
                          )}
                        </div>

                        {block.type !== 'title' && (!isTextLayer || isSelected) && (
                          <div className={`transition-opacity duration-150 ${
                            isSelected ? 'opacity-100' : 'opacity-0'
                          } flex items-center justify-between pt-1 border-t font-mono ${block.w === 1 || block.h === 1 ? 'text-[5px]' : 'text-[8px]'} uppercase tracking-widest ${
                            isTextLayer
                              ? 'absolute -bottom-5 left-0 right-0 border-none text-swiss-red'
                              : isSelected
                                ? 'border-white/30'
                                : 'border-swiss-black/10 opacity-30 text-swiss-black'
                          }`}>
                            <div className="flex flex-col">
                              <span>XY:{block.x}:{block.y}</span>
                              <span>WH:{block.w}:{block.h}</span>
                            </div>
                            <span>GRID.SYS</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Resize Handle — 右下角，仅选中时显示 */}
                    {isSelected && selectedIds.length === 1 && !isLocked && (
                      <div
                        className="absolute bottom-0 right-0 w-3 h-3 bg-swiss-red cursor-se-resize z-50 flex items-center justify-center"
                        style={{ margin: '2px' }}
                        onMouseDown={(e) => handleResizeStart(e, block.id)}
                      >
                        {/* 小三角视觉提示 */}
                        <div className="w-1.5 h-1.5 border-r-2 border-b-2 border-white opacity-70" />
                      </div>
                    )}
                    {block.linkUrl && (
                      <a
                        href={block.linkUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="absolute top-1 right-1 z-[60] w-5 h-5 bg-white/90 text-swiss-black border border-black/10 flex items-center justify-center hover:bg-swiss-red hover:text-white"
                        onMouseDown={(e) => e.stopPropagation()}
                        title={block.linkUrl}
                      >
                        <Link size={11} />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* Sidebar Right: Inspector */}
      <aside className="fixed right-0 top-[52px] bottom-0 w-[260px] glass-panel z-40 p-6 flex flex-col overflow-hidden">
        <div className="mb-6">
          <h2 className="section-label">{t.inspector}</h2>
          {selectedBlock ? (
            <div className="py-2 border-b border-black/5">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-swiss-red" />
                <span className="min-w-0 flex-1 truncate text-[11px] font-black uppercase text-swiss-black tracking-tight">{selectedBlock.label}</span>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-1">
                {[
                  { label: 'TYPE', value: selectedBlock.type },
                  { label: 'XY', value: `${selectedBlock.x + 1}:${selectedBlock.y + 1}` },
                  { label: 'WH', value: `${selectedBlock.w}:${selectedBlock.h}` },
                  { label: 'Z', value: selectedBlock.zIndex || 1 },
                ].map(item => (
                  <div key={item.label} className="border border-swiss-black/10 bg-white/60 px-1.5 py-1">
                    <span className="block text-[7px] font-black uppercase tracking-widest text-swiss-black/30">{item.label}</span>
                    <span className="block mt-0.5 truncate font-mono text-[9px] font-bold text-swiss-black">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : selectedIds.length > 1 ? (
            <div className="py-2 border-b border-black/5">
              <span className="text-[10px] font-bold text-swiss-grey-dark uppercase tracking-widest">{selectedIds.length} {t.selectedBlocks}</span>
              <p className="mt-2 text-[10px] leading-relaxed text-swiss-black/45">
                {language === 'zh' ? '拖动任一已选区块即可整体移动。按住 Shift 或 Command 点击区块可增减选择。' : 'Drag any selected block to move the group. Hold Shift or Command to add or remove blocks.'}
              </p>
            </div>
          ) : (
            <div className="py-2 border-b border-black/5">
              <span className="text-[10px] font-bold text-swiss-grey-dark uppercase tracking-widest">{t.selectElement}</span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide space-y-6 pb-4">
          {selectedBlock ? (
            <>
              <div className="space-y-0 px-1">
                <div className="grid grid-cols-1 gap-0">
                  <PrecisionSlider 
                    label="GRID_X (COLUMN)" 
                    min={1}
                    max={gridMetrics.columns - selectedBlock.w + 1}
                    value={selectedBlock.x + 1} 
                    onChange={(v) => {
                      const newX = v - 1;
                      const maxW = gridMetrics.columns - newX;
                      const newW = Math.min(selectedBlock.w, maxW);
                      updateBlock(selectedBlock.id, { x: newX, w: newW }, true);
                      setBlocks(prev => settleBlocks(prev));
                    }}
                  />
                  <PrecisionSlider 
                    label="GRID_Y (ROW)" 
                    min={1}
                    max={gridMetrics.rows - selectedBlock.h + 1}
                    value={selectedBlock.y + 1} 
                    onChange={(v) => {
                      const newY = v - 1;
                      const maxH = gridMetrics.rows - newY;
                      const newH = Math.min(selectedBlock.h, maxH);
                      updateBlock(selectedBlock.id, { y: newY, h: newH }, true);
                      setBlocks(prev => settleBlocks(prev));
                    }}
                  />
                  <PrecisionSlider 
                    label="SPAN_W (WIDTH)" 
                    min={1}
                    max={gridMetrics.columns - selectedBlock.x}
                    value={selectedBlock.w} 
                    onChange={(v) => {
                      updateBlock(selectedBlock.id, { w: v }, true);
                      setBlocks(prev => settleBlocks(prev));
                    }}
                  />
                  <PrecisionSlider 
                    label="SPAN_H (HEIGHT)" 
                    min={1}
                    max={gridMetrics.rows - selectedBlock.y}
                    value={selectedBlock.h} 
                    onChange={(v) => {
                      updateBlock(selectedBlock.id, { h: v }, true);
                      setBlocks(prev => settleBlocks(prev));
                    }}
                  />
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-swiss-black/10">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold uppercase tracking-widest opacity-40">{t.layerOrder}</span>
                  <span className="font-mono text-[9px] font-bold text-swiss-red">Z:{selectedBlock.zIndex || 1}</span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {[
                    { label: 'BACK', action: 'back' as const },
                    { label: 'DOWN', action: 'down' as const },
                    { label: 'UP', action: 'up' as const },
                    { label: 'FRONT', action: 'front' as const },
                  ].map(item => (
                    <button
                      key={item.action}
                      onClick={() => updateLayerOrder(selectedBlock.id, item.action)}
                      className="py-1.5 text-[9px] font-bold font-mono border bg-white text-swiss-black border-swiss-black/10 hover:border-swiss-red hover:text-swiss-red transition-all"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {selectedBlock?.type === 'image' && selectedBlock.imageUrl && (
                <div className="space-y-3 pt-4 border-t border-swiss-black/10">
                  <span className="text-[9px] font-bold uppercase tracking-widest opacity-40">{t.imageTransform}</span>

                  {/* 旋转 4档 */}
                  <div>
                    <span className="text-[9px] font-mono uppercase opacity-40 block mb-1">ROTATION</span>
                    <div className="grid grid-cols-4 gap-1">
                      {[0, 90, 180, 270].map(deg => (
                        <button
                          key={deg}
                          onClick={() => updateBlock(selectedBlock.id, { imageRotation: deg as 0|90|180|270 }, true)}
                          className={`py-1.5 text-[10px] font-bold font-mono border transition-all ${
                            (selectedBlock.imageRotation || 0) === deg
                              ? 'bg-swiss-red text-white border-swiss-red'
                              : 'bg-white text-swiss-black border-swiss-black/10 hover:border-swiss-red'
                          }`}
                        >
                          {deg}°
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 镜向 */}
                  <div>
                    <span className="text-[9px] font-mono uppercase opacity-40 block mb-1">FLIP</span>
                    <div className="grid grid-cols-2 gap-1">
                      <button
                        onClick={() => updateBlock(selectedBlock.id, { imageFlipX: !selectedBlock.imageFlipX }, true)}
                        className={`py-1.5 text-[10px] font-bold font-mono border transition-all ${
                          selectedBlock.imageFlipX
                            ? 'bg-swiss-red text-white border-swiss-red'
                            : 'bg-white text-swiss-black border-swiss-black/10 hover:border-swiss-red'
                        }`}
                      >↔ HORIZONTAL</button>
                      <button
                        onClick={() => updateBlock(selectedBlock.id, { imageFlipY: !selectedBlock.imageFlipY }, true)}
                        className={`py-1.5 text-[10px] font-bold font-mono border transition-all ${
                          selectedBlock.imageFlipY
                            ? 'bg-swiss-red text-white border-swiss-red'
                            : 'bg-white text-swiss-black border-swiss-black/10 hover:border-swiss-red'
                        }`}
                      >↕ VERTICAL</button>
                    </div>
                  </div>
                </div>
              )}

              {selectedBlock && ['text','heading','title'].includes(selectedBlock.type) && (
                <div className="space-y-3 pt-4 border-t border-swiss-black/10">
                  <span className="text-[9px] font-bold uppercase tracking-widest opacity-40">TYPOGRAPHY</span>

                  <div>
                    <span className="text-[9px] font-mono uppercase opacity-40 block mb-1">{t.textLayer}</span>
                    <div className="grid grid-cols-3 gap-1">
                      {[
                        { value: 'visible', label: 'VISIBLE' },
                        { value: 'clip', label: 'CLIP' },
                        { value: 'autoHeight', label: 'AUTO' },
                      ].map(mode => (
                        <button
                          key={mode.value}
                          onClick={() => updateBlock(selectedBlock.id, { overflowMode: mode.value as LayoutBlock['overflowMode'] }, true)}
                          className={`py-1.5 text-[9px] border transition-all uppercase ${
                            (selectedBlock.overflowMode || 'visible') === mode.value
                              ? 'bg-swiss-red text-white border-swiss-red'
                              : 'bg-white text-swiss-black border-swiss-black/10 hover:border-swiss-red'
                          }`}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="text-[9px] font-mono uppercase opacity-40 block mb-1">{t.background}</span>
                    <div className="grid grid-cols-6 gap-1">
                      {['transparent', '#FFFFFF', '#FFF3C4', '#1040FF', '#FF3333', '#111111'].map(color => (
                        <button
                          key={color}
                          onClick={() => updateBlock(selectedBlock.id, { backgroundColor: color }, true)}
                          className={`h-7 border transition-all ${
                            (selectedBlock.backgroundColor || 'transparent') === color
                              ? 'ring-2 ring-swiss-red ring-offset-1'
                              : 'border-swiss-black/10'
                          } ${color === 'transparent' ? 'bg-white bg-[linear-gradient(135deg,transparent_45%,#ff3333_46%,#ff3333_54%,transparent_55%)]' : ''}`}
                          style={{ backgroundColor: color === 'transparent' ? undefined : color }}
                          title={color}
                        />
                      ))}
                    </div>
                    <input
                      type="color"
                      value={(selectedBlock.backgroundColor && selectedBlock.backgroundColor !== 'transparent') ? selectedBlock.backgroundColor : '#ffffff'}
                      onFocus={rememberBlocks}
                      onChange={(e) => updateBlock(selectedBlock.id, { backgroundColor: e.target.value })}
                      className="mt-2 w-full h-8 bg-white border border-swiss-black/10"
                    />
                  </div>

                  <PrecisionSlider
                    label={`${t.padding} [PX]`}
                    min={0}
                    max={48}
                    value={selectedBlock.padding ?? 8}
                    onChange={(v) => updateBlock(selectedBlock.id, { padding: v })}
                  />

                  <PrecisionSlider
                    label={t.lineClamp}
                    min={0}
                    max={8}
                    value={selectedBlock.lineClamp ?? 0}
                    onChange={(v) => updateBlock(selectedBlock.id, { lineClamp: v === 0 ? undefined : v })}
                  />

                  {/* 字体选择 */}
                  <div>
                    <span className="text-[9px] font-mono uppercase opacity-40 block mb-1">{t.typeface}</span>
                    <div className="grid grid-cols-2 gap-1">
                      {[
                        { label: 'INTER', value: 'Inter, sans-serif' },
                        { label: 'PLAYFAIR', value: 'Playfair Display, serif' },
                        { label: 'MONO', value: 'monospace' },
                        { label: 'HELVETICA', value: 'Helvetica Neue, Helvetica, Arial, sans-serif' },
                      ].map(f => (
                        <button
                          key={f.value}
                          onClick={() => updateBlock(selectedBlock.id, { fontFamily: f.value }, true)}
                          className={`py-1.5 text-[10px] font-bold border transition-all ${
                            selectedBlock.fontFamily === f.value
                              ? 'bg-swiss-red text-white border-swiss-red'
                              : 'bg-white text-swiss-black border-swiss-black/10 hover:border-swiss-red'
                          }`}
                          style={{ fontFamily: f.value }}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 字重 */}
                  <div>
                    <span className="text-[9px] font-mono uppercase opacity-40 block mb-1">{t.weight}</span>
                    <div className="grid grid-cols-2 gap-1">
                      {(['normal','bold'] as const).map(w => (
                        <button
                          key={w}
                          onClick={() => updateBlock(selectedBlock.id, { fontWeight: w }, true)}
                          className={`py-1.5 text-[10px] border transition-all uppercase ${
                            (selectedBlock.fontWeight || 'normal') === w
                              ? 'bg-swiss-red text-white border-swiss-red'
                              : 'bg-white text-swiss-black border-swiss-black/10 hover:border-swiss-red'
                          }`}
                          style={{ fontWeight: w }}
                        >
                          {w}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 字行 */}
                  <div>
                    <span className="text-[9px] font-mono uppercase opacity-40 block mb-1">{t.style}</span>
                    <div className="grid grid-cols-2 gap-1">
                      {[
                        { value: 'normal', label: 'REGULAR', icon: <Bold size={12} className="opacity-35" /> },
                        { value: 'italic', label: 'ITALIC', icon: <Italic size={12} /> },
                      ].map(s => (
                        <button
                          key={s.value}
                          onClick={() => updateBlock(selectedBlock.id, { fontStyle: s.value as 'normal'|'italic' }, true)}
                          className={`py-1.5 text-[10px] border transition-all uppercase flex items-center justify-center gap-1 ${
                            (selectedBlock.fontStyle || 'normal') === s.value
                              ? 'bg-swiss-red text-white border-swiss-red'
                              : 'bg-white text-swiss-black border-swiss-black/10 hover:border-swiss-red'
                          }`}
                        >
                          {s.icon}
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 颜色 */}
                  <div>
                    <span className="text-[9px] font-mono uppercase opacity-40 block mb-1">{t.color}</span>
                    <div className="grid grid-cols-6 gap-1">
                      {['#111111', '#FF3333', '#2F80ED', '#1B8A5A', '#C88B00', '#FFFFFF'].map(color => (
                        <button
                          key={color}
                          onClick={() => updateBlock(selectedBlock.id, { textColor: color }, true)}
                          className={`h-7 border transition-all ${selectedBlock.textColor === color ? 'ring-2 ring-swiss-red ring-offset-1' : 'border-swiss-black/10'}`}
                          style={{ backgroundColor: color }}
                          title={color}
                        />
                      ))}
                    </div>
                    <input
                      type="color"
                      value={selectedBlock.textColor || '#111111'}
                      onFocus={rememberBlocks}
                      onChange={(e) => updateBlock(selectedBlock.id, { textColor: e.target.value })}
                      className="mt-2 w-full h-8 bg-white border border-swiss-black/10"
                    />
                  </div>

                  {/* 字号 Slider */}
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-[9px] font-mono uppercase opacity-40">{t.size}</span>
                      <span className="text-[9px] font-mono">{selectedBlock.fontSize || 12}px</span>
                    </div>
                    <input
                      type="range" min={8} max={72} step={1}
                      value={selectedBlock.fontSize || 12}
                      onChange={(e) => updateBlock(selectedBlock.id, { fontSize: Number(e.target.value) })}
                      className="w-full accent-swiss-red"
                    />
                  </div>

                  {/* 对齐 */}
                  <div>
                    <span className="text-[9px] font-mono uppercase opacity-40 block mb-1">{t.alignment}</span>
                    <div className="grid grid-cols-3 gap-1">
                      {[
                        { value: 'left', icon: '⬅' },
                        { value: 'center', icon: '↔' },
                        { value: 'right', icon: '➡' },
                      ].map(a => (
                        <button
                          key={a.value}
                          onClick={() => updateBlock(selectedBlock.id, { textAlign: a.value as 'left'|'center'|'right' }, true)}
                          className={`py-1.5 text-[12px] border transition-all ${
                            (selectedBlock.textAlign || 'left') === a.value
                              ? 'bg-swiss-red text-white border-swiss-red'
                              : 'bg-white text-swiss-black border-swiss-black/10 hover:border-swiss-red'
                          }`}
                        >
                          {a.icon}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {isSelectedTextBlock && (
              <div className="space-y-3 pt-4 border-t border-black/5">
                <h3 className="section-label">{t.content}</h3>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#666]">{t.blockLabel}</span>
                  <input 
                    type="text" 
                    value={selectedBlock.label} 
                    onChange={(e) => updateBlock(selectedBlock.id, { label: e.target.value })}
                    onFocus={rememberBlocks}
                    className="w-full mt-1 p-2 bg-white border border-black/10 text-[11px] font-bold uppercase tracking-tight focus:border-swiss-red outline-none transition-colors"
                  />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#666]">{t.hyperlink}</span>
                  <div className="flex items-center gap-2 mt-1">
                    <Link size={14} className="text-swiss-black/35" />
                    <input
                      type="url"
                      value={selectedBlock.linkUrl || ''}
                      placeholder="https://example.com"
                      onFocus={rememberBlocks}
                      onChange={(e) => updateBlock(selectedBlock.id, { linkUrl: e.target.value })}
                      className="flex-1 p-2 bg-white border border-black/10 text-[11px] font-mono focus:border-swiss-red outline-none transition-colors"
                    />
                  </div>
                </div>
              </div>
              )}

              {isSelectedImageBlock && selectedBlock.imageUrl && (
                <div className="space-y-4 pt-4 border-t border-black/5">
                  <h3 className="section-label">{t.imageTransform}</h3>
                  <button 
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) handleFileUpload(selectedBlock.id, file);
                      };
                      input.click();
                    }}
                    className="w-full py-2 bg-white border border-black/10 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-swiss-grey-light transition-colors"
                  >
                    <Upload size={14} />
                    {t.replaceImage}
                  </button>
                  <div className="space-y-2">
                    <div className="inspector-row !border-none">
                      <span className="text-[10px] uppercase font-bold text-[#666]">{t.fitMode}</span>
                      <div className="flex gap-1">
                        <button 
                          onClick={() => updateBlock(selectedBlock.id, { imageFit: 'cover' }, true)}
                          className={`p-1 border transition-all ${selectedBlock.imageFit === 'cover' ? 'bg-swiss-red border-swiss-red text-white' : 'bg-white border-black/10 text-black/40'}`}
                        >
                          <Scaling size={12} />
                        </button>
                        <button 
                          onClick={() => updateBlock(selectedBlock.id, { imageFit: 'contain' }, true)}
                          className={`p-1 border transition-all ${selectedBlock.imageFit === 'contain' ? 'bg-swiss-red border-swiss-red text-white' : 'bg-white border-black/10 text-black/40'}`}
                        >
                          <Fullscreen size={12} />
                        </button>
                      </div>
                    </div>

                    <PrecisionSlider 
                      label="Scale_Zoom" 
                      min={50}
                      max={300}
                      value={Math.round((selectedBlock.imageZoom || 1) * 100)} 
                      onChange={(v) => updateBlock(selectedBlock.id, { imageZoom: v / 100 }, true)}
                      prefix="%"
                    />

                    <PrecisionSlider 
                      label="PAN_X" 
                      min={-200}
                      max={200}
                      value={selectedBlock.imagePanX || 0} 
                      onChange={(v) => updateBlock(selectedBlock.id, { imagePanX: v }, true)}
                    />

                    <PrecisionSlider 
                      label="PAN_Y" 
                      min={-200}
                      max={200}
                      value={selectedBlock.imagePanY || 0} 
                      onChange={(v) => updateBlock(selectedBlock.id, { imagePanY: v }, true)}
                    />
                  </div>
                </div>
              )}

            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-3 grayscale">
              <Box size={48} strokeWidth={1} />
              <span className="text-[10px] font-mono font-bold text-swiss-black/20">NULL.DATA</span>
              <p className="max-w-[160px] text-[10px] leading-relaxed text-swiss-black/30">
                {language === 'zh' ? '选择画布里的文字或图片区块后，这里会显示网格、图层和样式参数。' : 'Select a text or image block to edit grid, layer, and style parameters here.'}
              </p>
            </div>
          )}
        </div>
        <div className="mt-4 -mx-6 -mb-6 p-4 bg-swiss-black/5 border-t border-swiss-black/10">
          <h3 className="section-label">{t.export}</h3>
          <div className="grid grid-cols-1 gap-2">
            <button 
              onClick={exportSVG}
              className="w-full py-3 bg-white text-swiss-black text-[11px] font-bold uppercase tracking-widest hover:bg-swiss-red hover:text-white transition-all border border-swiss-black/10 hover:border-swiss-red"
            >
              {t.exportSvg}
            </button>
            <button 
              onClick={() => alert(language === 'zh' ? 'PDF 规格导出功能准备中...' : 'PDF spec export is coming soon...')}
              className="w-full py-3 bg-[#111] text-white text-[11px] font-bold uppercase tracking-widest hover:bg-swiss-black transition-all border border-transparent hover:border-white/20"
            >
              {t.exportPdf}
            </button>
          </div>
        </div>
      </aside>

      <AnimatePresence>
        {aiConfirmOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-black/35 backdrop-blur-[2px] flex items-center justify-center px-6"
            onMouseDown={closeAiConfirm}
          >
            <motion.div
              initial={{ y: 14, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 14, opacity: 0 }}
              onMouseDown={(event) => event.stopPropagation()}
              className="w-[720px] max-w-[calc(100vw-48px)] bg-white border border-swiss-black/10 shadow-2xl p-6"
            >
              <div className="flex items-start justify-between gap-5">
                <div>
                  <h2 className="text-[13px] font-black uppercase tracking-widest text-swiss-black">
                    {language === 'zh' ? 'AI 预览生成' : 'AI Preview'}
                  </h2>
                  <p className="mt-3 text-[13px] leading-relaxed text-swiss-black/60">
                    {language === 'zh'
                      ? 'AI会通过当前的排版格式给你生成一张完整的可视化预览，确定要继续吗？'
                      : 'AI will generate a complete visual preview from the current layout. Continue?'}
                  </p>
                </div>
                <button
                  onClick={closeAiConfirm}
                  className="w-8 h-8 border border-swiss-black/10 flex items-center justify-center hover:bg-swiss-red hover:text-white transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
              {aiPendingBoardImage && (
                <div className="mt-5 border border-swiss-black/10 bg-swiss-grey-canvas p-3">
                  <div className="mb-2 text-[9px] font-black uppercase tracking-widest text-swiss-black/45">
                    {language === 'zh' ? '将发送给 AI 的真实画板截图' : 'Actual canvas image sent to AI'}
                  </div>
                  <img
                    src={aiPendingBoardImage}
                    alt="Canvas image to send to AI"
                    className="w-full max-h-[46vh] object-contain bg-white"
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 mt-6">
                <button
                  onClick={startAiPreviewGeneration}
                  className="h-11 bg-swiss-red text-white text-[10px] font-black uppercase tracking-widest hover:bg-swiss-black transition-colors"
                >
                  {language === 'zh' ? '继续' : 'Continue'}
                </button>
                <button
                  onClick={closeAiConfirm}
                  className="h-11 bg-white border border-swiss-black/10 text-swiss-black/55 text-[10px] font-black uppercase tracking-widest hover:border-swiss-red hover:text-swiss-red transition-colors"
                >
                  {language === 'zh' ? '我想继续调整' : 'Keep Adjusting'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(aiPreviewImage || aiGenerationError) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[95] bg-[#111] flex flex-col"
          >
            <div className="flex-1 min-h-0 flex items-center justify-center p-8 bg-[#1A1A1A]">
              {aiPreviewImage ? (
                <img
                  src={aiPreviewImage}
                  alt="AI portfolio preview"
                  className="max-w-full max-h-full object-contain bg-white shadow-2xl"
                />
              ) : (
                <div className="w-[520px] bg-white p-6 border border-swiss-red/30">
                  <h2 className="text-[13px] font-black uppercase tracking-widest text-swiss-red">
                    {language === 'zh' ? '生成失败' : 'Generation Failed'}
                  </h2>
                  <p className="mt-3 text-[12px] leading-relaxed text-swiss-black/60">{aiGenerationError}</p>
                </div>
              )}
            </div>
            <div className="h-20 bg-white border-t border-swiss-black/10 flex items-center justify-center gap-3 px-6">
              {aiPreviewImage && (
                <button
                  onClick={downloadAiPreviewJpg}
                  className="h-11 px-8 bg-swiss-red text-white text-[10px] font-black uppercase tracking-widest hover:bg-swiss-black transition-colors"
                >
                  {language === 'zh' ? '下载 JPG' : 'Download JPG'}
                </button>
              )}
              <button
                onClick={exitAiPreview}
                className="h-11 px-8 bg-white border border-swiss-black/10 text-swiss-black/60 text-[10px] font-black uppercase tracking-widest hover:border-swiss-red hover:text-swiss-red transition-colors"
              >
                {language === 'zh' ? '退出' : 'Exit'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showGuide && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-black/35 backdrop-blur-[2px] flex items-start justify-center pt-[84px]"
            onMouseDown={() => {
              localStorage.setItem('gridSysGuideSeen', '1');
              setShowGuide(false);
            }}
          >
            <motion.div
              initial={{ y: -12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -12, opacity: 0 }}
              onMouseDown={(e) => e.stopPropagation()}
              className="w-[560px] bg-white border border-swiss-black/10 shadow-2xl p-6"
            >
              <div className="flex items-start justify-between gap-6">
                <div>
                  <h2 className="text-[13px] font-black uppercase tracking-widest">新手导航</h2>
                  <p className="mt-2 text-[12px] leading-relaxed text-swiss-black/55">从左侧选择模板占位、上传素材并随机分配；中间整理版面；右侧对每个元素进行精细调整。</p>
                </div>
                <button
                  onClick={() => {
                    localStorage.setItem('gridSysGuideSeen', '1');
                    setShowGuide(false);
                  }}
                  className="w-8 h-8 border border-swiss-black/10 flex items-center justify-center hover:bg-swiss-red hover:text-white transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-5">
                {[
                  { icon: <Upload size={18} />, title: '素材', body: '在左侧选择页面类型并上传图片，需要时开启文字素材或参考排版。' },
                  { icon: <Shuffle size={18} />, title: '分配', body: '使用随机分配把图片和文字放入当前区块，再手动拖拽和微调。' },
                  { icon: <Settings2 size={18} />, title: '精修', body: '选中画布元素后，用右侧面板调整尺寸、图像和文字细节。' },
                ].map(item => (
                  <div key={item.title} className="border border-swiss-black/10 p-4 bg-swiss-grey-base/40">
                    <div className="w-8 h-8 bg-swiss-black text-white flex items-center justify-center mb-3">{item.icon}</div>
                    <div className="text-[11px] font-black uppercase tracking-widest">{item.title}</div>
                    <p className="mt-2 text-[10px] leading-relaxed text-swiss-black/50">{item.body}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  localStorage.setItem('gridSysGuideSeen', '1');
                  setShowGuide(false);
                }}
                className="mt-5 w-full py-3 bg-swiss-red text-white text-[11px] font-bold uppercase tracking-widest hover:bg-swiss-black transition-colors"
              >
                Start Editing
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EditableTextBlock({ block, isSelected, updateBlock }: { block: LayoutBlock, isSelected: boolean, updateBlock: (id: string, updates: Partial<LayoutBlock>, remember?: boolean) => void }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const overflowMode = block.overflowMode || 'visible';
  const lineClamp = block.lineClamp;
  const textStyle: React.CSSProperties = {
    fontFamily: block.fontFamily || 'monospace',
    fontWeight: block.fontWeight === 'black' ? 900 : block.fontWeight === 'bold' ? 700 : 400,
    fontStyle: block.fontStyle || 'normal',
    fontSize: `${block.fontSize || 13}px`,
    textAlign: block.textAlign || 'left',
    color: block.textColor || 'inherit',
    backgroundColor: 'transparent',
  };

  useEffect(() => {
    const el = textareaRef.current;
    if (el) setHasOverflow(el.scrollHeight > el.clientHeight);
  }, [block.label, block.fontSize, block.w, block.h]);

  if (!isSelected) {
    return (
      <div
        className={`w-full relative leading-snug whitespace-pre-wrap break-words ${
          overflowMode === 'visible' && !lineClamp ? 'overflow-visible' : 'overflow-hidden'
        } ${overflowMode === 'autoHeight' ? 'min-h-full h-auto' : 'h-full'}`}
        style={{
          ...textStyle,
          padding: block.padding ?? 8,
          ...(lineClamp ? {
            display: '-webkit-box',
            WebkitLineClamp: lineClamp,
            WebkitBoxOrient: 'vertical'
          } : {})
        }}
      >
        {block.label}
      </div>
    );
  }

  return (
    <div
      className={`w-full relative group/text flex items-start justify-start ${
        overflowMode === 'visible' ? 'overflow-visible' : 'overflow-hidden'
      } ${overflowMode === 'autoHeight' ? 'min-h-full h-auto' : 'h-full'}`}
      style={{ padding: block.padding ?? 8 }}
    >
      <textarea
        ref={textareaRef}
        value={block.label}
        onChange={(e) => updateBlock(block.id, { label: e.target.value })}
        placeholder="TYPE_HERE..."
        style={textStyle}
        className={`w-full bg-transparent border-none resize-none outline-none text-left leading-snug placeholder:opacity-20 scrollbar-hide ${
          overflowMode === 'autoHeight' ? 'min-h-[44px] overflow-visible' : 'h-full'
        } ${overflowMode === 'visible' ? 'overflow-visible' : 'overflow-hidden'}`}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onFocus={() => {
          if (block.label === '点击编辑文字' || block.label === 'TEXT BLOCK') {
            updateBlock(block.id, { label: '' }, true);
          } else {
            updateBlock(block.id, {}, true);
          }
        }}
      />
      {hasOverflow && (
        <div 
          className="absolute bottom-1 right-1 w-2 h-2 bg-swiss-red rounded-full animate-pulse border border-white shadow-[0_0_8px_rgba(255,51,51,0.5)]" 
          title="TYPOGRAPHY_OVERFLOW_DETECTED"
        />
      )}
    </div>
  );
}

function GridView({
  showGrid,
  showBaseline,
  label,
  size,
  metrics
}: {
  showGrid: boolean;
  showBaseline: boolean;
  label: string;
  size: { width: number; height: number };
  metrics: ReturnType<typeof getGridMetrics>;
}) {
  if (!showGrid && !showBaseline) return null;
  const baselineCount = Math.floor(metrics.safeAreaHeight / metrics.baseline) + 1;
  const baselineColumnCount = Math.floor(metrics.safeAreaWidth / metrics.baseline) + 1;
  const guideOrigin = metrics.guides?.origin || 'liveArea';
  const verticalGuides = normalizeGuides(
    metrics.guides?.vertical,
    buildModuleGuides(metrics.columns, metrics.colWidth, metrics.gutter)
  ).filter(guide => guide.kind !== 'liveArea_edge');
  const horizontalGuides = normalizeGuides(
    metrics.guides?.horizontal,
    buildModuleGuides(metrics.rows, metrics.rowHeight, metrics.rowGap)
  ).filter(guide => guide.kind !== 'liveArea_edge');
  const guideLeft = (value: number) => guideOrigin === 'canvas' ? value : metrics.margin + value;
  const guideTop = (value: number) => guideOrigin === 'canvas' ? value : metrics.margin + value;
  const guideClass = (kind?: string) => kind?.includes('gutter')
    ? 'bg-swiss-red/55'
    : kind?.includes('caption') || kind?.includes('band')
      ? 'bg-swiss-red/35'
      : 'bg-swiss-red/45';
  return (
    <div data-ai-capture-ignore="true" className="absolute inset-0 pointer-events-none select-none">
      <div className="absolute inset-0 border border-transparent opacity-0" style={{ margin: metrics.margin - 1 }} />
      {showBaseline && (
        <div
          className="absolute overflow-hidden"
          style={{
            left: metrics.margin,
            top: metrics.margin,
            width: metrics.safeAreaWidth,
            height: metrics.safeAreaHeight
          }}
        >
          {[...Array(baselineCount)].map((_, i) => i > 0 && (
            <div
              key={`baseline-h-${i}`}
              className="absolute left-0 right-0 h-px bg-swiss-black/12"
              style={{ top: i * metrics.baseline }}
            />
          ))}
          {[...Array(baselineColumnCount)].map((_, i) => i > 0 && (
            <div
              key={`baseline-v-${i}`}
              className="absolute top-0 bottom-0 w-px bg-swiss-black/10"
              style={{ left: i * metrics.baseline }}
            />
          ))}
        </div>
      )}
      {showGrid && (
        <>
          <div
            className="absolute"
            style={{
              left: metrics.margin,
              top: metrics.margin,
              width: metrics.safeAreaWidth,
              height: metrics.safeAreaHeight
            }}
          >
            {[...Array(metrics.columns * metrics.rows)].map((_, i) => {
              const col = i % metrics.columns;
              const row = Math.floor(i / metrics.columns);
              return (
                <div
                  key={i}
                  className="absolute bg-swiss-red/[0.018]"
                  style={{
                    left: col * metrics.colUnit,
                    top: row * metrics.rowUnit,
                    width: metrics.colWidth,
                    height: metrics.rowHeight
                  }}
                />
              );
            })}
          </div>
          {verticalGuides.map((guide, index) => (
            <div
              key={`v-${index}-${guide.position}`}
              className={`absolute top-0 bottom-0 w-px ${guideClass(guide.kind)}`}
              style={{ left: guideLeft(guide.position) }}
              title={guide.label}
            />
          ))}
          {horizontalGuides.map((guide, index) => (
            <div
              key={`h-${index}-${guide.position}`}
              className={`absolute left-0 right-0 h-px ${guideClass(guide.kind)}`}
              style={{ top: guideTop(guide.position) }}
              title={guide.label}
            />
          ))}
        </>
      )}
      <div className="absolute top-4 left-4 font-mono text-[8px] text-swiss-red/40 flex gap-4 uppercase font-bold">
        <span>Canvas: {label}</span>
        <span>Resolution: {size.width}x{size.height}</span>
      </div>
      <div className="absolute bottom-4 left-4 font-mono text-[8px] text-swiss-red/40 flex gap-4 uppercase font-bold">
        <span>Modular: {metrics.columns}x{metrics.rows}</span>
        <span>Gutter: {metrics.gutter}/{metrics.rowGap}PT</span>
        <span>Margin: {metrics.margin}PT</span>
        <span>Baseline: {metrics.baseline}PT</span>
      </div>
      <div className="absolute bottom-4 right-4">
        <span className="font-mono text-[8px] text-swiss-red/40 font-bold uppercase tracking-widest">Grid System / v2.4</span>
      </div>
      <div className="absolute top-0 left-0 w-8 h-8 border-t border-l border-transparent" />
      <div className="absolute top-0 right-0 w-8 h-8 border-t border-r border-transparent" />
      <div className="absolute bottom-0 left-0 w-8 h-8 border-b border-l border-transparent" />
      <div className="absolute bottom-0 right-0 w-8 h-8 border-b border-r border-transparent" />
    </div>
  );
}

function CollapsibleSection({
  title,
  icon,
  collapsed,
  onToggle,
  children,
  meta
}: {
  title: string;
  icon: React.ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  meta?: string;
}) {
  return (
    <div className="border border-swiss-black/10 bg-white/50">
      <button
        onClick={onToggle}
        className="w-full h-10 px-3 flex items-center justify-between text-left hover:bg-white/70 transition-colors"
      >
        <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-swiss-black/60">
          {icon}
          {title}
        </span>
        <span className="flex items-center gap-2">
          {meta && <span className="font-mono text-[8px] font-bold text-swiss-red">{meta}</span>}
          <ChevronRight
            size={13}
            className={`text-swiss-black/35 transition-transform ${collapsed ? '' : 'rotate-90'}`}
          />
        </span>
      </button>
      {!collapsed && (
        <div className="px-3 pb-3">
          {children}
        </div>
      )}
    </div>
  );
}

function CategorySection({ title, icon, items, onAdd }: { title: string, icon: React.ReactNode, items: string[], onAdd: (item: string) => void }) {
  return (
    <div className="mb-8">
      <h3 className="section-label mb-3 flex items-center gap-2">
        {icon}
        {title.toUpperCase()}
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {items.map(item => (
          <button 
            key={item} 
            onClick={(e) => { e.stopPropagation(); onAdd(item); }}
            className="group relative overflow-hidden bg-white border border-swiss-black/10 hover:border-swiss-red p-3 transition-all duration-200"
          >
            <div className="flex flex-col gap-2">
              <div className="w-full aspect-[4/3] bg-swiss-grey-base border border-swiss-black/5 flex items-center justify-center relative">
                <div className="w-4 h-4 border border-swiss-black/20 group-hover:border-swiss-red/40 group-hover:bg-swiss-red/5 transition-colors" />
                <div className="absolute top-1 left-1 flex gap-0.5">
                  <div className="w-1 h-1 bg-swiss-red/30 rounded-full" />
                  <div className="w-1 h-1 bg-swiss-red/30 rounded-full" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase tracking-tight text-swiss-black/80 group-hover:text-swiss-red">{item}</span>
                <Plus size={8} className="opacity-0 group-hover:opacity-100 text-swiss-red" />
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function PrecisionSlider({ label, min, max, value, onChange, prefix = "" }: { label: string, min: number, max: number, value: number, onChange: (v: number) => void, prefix?: string }) {
  const intValue = typeof value === 'string' ? parseInt(value, 10) : Math.round(value);
  return (
    <div className="flex flex-col gap-3 py-3 border-b border-black/5 last:border-b-0">
      <div className="flex justify-between items-baseline px-0.5">
        <span className="text-[9px] font-mono font-black uppercase text-swiss-black/40 tracking-wider ">{label}</span>
        <span className="text-[11px] font-mono font-black text-swiss-red italic">{prefix}{intValue.toString().padStart(2, '0')}</span>
      </div>
      <input 
        type="range" 
        min={min} 
        max={max} 
        step={1}
        value={intValue} 
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          if (!isNaN(v)) onChange(v);
        }}
        className="precision-slider"
      />
      <div className="flex justify-between text-[6px] font-mono opacity-20 uppercase tracking-tighter">
        <span>MIN_{min.toString().padStart(2, '0')}</span>
        <span>MAX_{max.toString().padStart(2, '0')}</span>
      </div>
    </div>
  );
}
