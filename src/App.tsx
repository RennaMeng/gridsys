/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
  Zap,
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
  Italic
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LayoutBlock, GridSettings } from './types';
import { analyzeProjectContent } from './utils/analyzeProjectContent';
import { loadAllTemplates } from './utils/loadTemplate';
import { renderJSONToLayoutBlocks } from './utils/renderElements';
import { ContentJSON, RenderJSON, TemplateJSON } from './utils/templateTypes';

// Constants
const COLUMNS = 24;
const ROWS = 16; 
const MARGIN = 48;
const GUTTER = 0;

type CanvasPresetId = 'digital-16-9' | 'strip-1800-768' | 'a3' | 'a4';
type CanvasOrientation = 'landscape' | 'portrait';
type LayoutMode = 'strict' | 'editorial';
type SidebarMode = 'generate' | 'edit';
type PageStage = 'discover' | 'define' | 'develop' | 'deliver';
type Language = 'zh' | 'en';
type ReferenceMode = 'template' | 'upload';
type ImageAssetRole = 'hero_image' | 'supporting_image' | 'diagram_image' | 'data_visualization' | 'icon_image' | 'background_image' | 'portrait_image' | 'product_image' | 'reference';
type AssetVisualType = 'portrait' | 'chart' | 'diagram' | 'product_photo' | 'field_photo' | 'screenshot';
type AssetInformationDensity = 'high' | 'medium' | 'low';
type AssetProfile = {
  visualType: AssetVisualType;
  informationDensity: AssetInformationDensity;
  recommendedRole: Exclude<ImageAssetRole, 'reference'>;
  subject?: string;
  bestUse?: string;
  confidence?: number;
  reasoning?: string;
  source?: 'local' | 'ai' | 'user';
};
type TextAssetRole = 'title' | 'subtitle' | 'body' | 'caption' | 'label';

type ImageAsset = {
  id: string;
  name: string;
  dataUrl: string;
  role: ImageAssetRole;
  width?: number;
  height?: number;
  assetProfile?: AssetProfile;
};

type TextAsset = {
  id: string;
  label: string;
  content: string;
  role: TextAssetRole;
};

type LayoutPreviewState = {
  prompt: string;
  templateId: string;
  referenceMode: ReferenceMode;
};

type PreviewPlanItem = {
  slotId: string;
  type: LayoutBlock['type'];
  x: number;
  y: number;
  w: number;
  h: number;
  note: string;
  fontSize?: number;
  lineClamp?: number;
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
const ASSET_VISUAL_TYPE_OPTIONS: Array<{ label: string; value: AssetVisualType }> = [
  { label: 'PORTRAIT', value: 'portrait' },
  { label: 'CHART', value: 'chart' },
  { label: 'DIAGRAM', value: 'diagram' },
  { label: 'PRODUCT', value: 'product_photo' },
  { label: 'FIELD', value: 'field_photo' },
  { label: 'SCREEN', value: 'screenshot' }
];
const ASSET_DENSITY_OPTIONS: Array<{ label: string; value: AssetInformationDensity }> = [
  { label: 'HIGH', value: 'high' },
  { label: 'MED', value: 'medium' },
  { label: 'LOW', value: 'low' }
];
const VISUAL_TYPE_ROLE_MAP: Record<AssetVisualType, Exclude<ImageAssetRole, 'reference'>> = {
  portrait: 'portrait_image',
  chart: 'data_visualization',
  diagram: 'diagram_image',
  product_photo: 'product_image',
  field_photo: 'supporting_image',
  screenshot: 'supporting_image'
};
const LOCAL_ASSET_PROFILE_COPY: Record<AssetVisualType, { subject: string; bestUse: string }> = {
  portrait: {
    subject: 'Possible person or user-context image.',
    bestUse: 'Interview, participant, user story, or case slot.'
  },
  chart: {
    subject: 'Possible data visualization or chart.',
    bestUse: 'Research evidence, statistic, or data slot.'
  },
  diagram: {
    subject: 'Possible diagram, map, or process visual.',
    bestUse: 'System, process, method, or mapping slot.'
  },
  product_photo: {
    subject: 'Possible product, prototype, model, or material detail.',
    bestUse: 'Prototype, component, outcome, or detail slot.'
  },
  field_photo: {
    subject: 'Possible field, context, or supporting photo.',
    bestUse: 'Hero, context, evidence, or supporting visual slot.'
  },
  screenshot: {
    subject: 'Possible interface screenshot or dense screen capture.',
    bestUse: 'UI evidence, process, testing, or medium supporting slot.'
  }
};
const isInteractiveTarget = (target: EventTarget | null) => (
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement ||
  target instanceof HTMLButtonElement ||
  target instanceof HTMLAnchorElement ||
  (target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, button, a, [contenteditable="true"]')))
);

const inferLocalAssetProfile = (
  fileName: string,
  width?: number,
  height?: number,
  fallbackRole: Exclude<ImageAssetRole, 'reference'> = 'supporting_image'
): AssetProfile => {
  const name = fileName.toLowerCase();
  const aspectRatio = width && height ? width / height : 1;
  const visualType: AssetVisualType = /chart|graph|data|stat|plot|table|数据|图表/.test(name)
    ? 'chart'
    : /diagram|map|flow|wireframe|schema|mapping|地图|流程|结构/.test(name)
      ? 'diagram'
      : /portrait|person|user|interview|avatar|人物|访谈|用户/.test(name)
        ? 'portrait'
        : /product|prototype|model|mockup|产品|原型|模型/.test(name)
          ? 'product_photo'
          : /screen|screenshot|ui|界面|截图/.test(name)
            ? 'screenshot'
            : 'field_photo';
  const informationDensity: AssetInformationDensity = visualType === 'chart' || visualType === 'diagram' || visualType === 'screenshot'
    ? 'high'
    : aspectRatio > 1.8 || aspectRatio < 0.65
      ? 'medium'
      : 'low';

  return {
    visualType,
    informationDensity,
    recommendedRole: VISUAL_TYPE_ROLE_MAP[visualType] || fallbackRole,
    subject: LOCAL_ASSET_PROFILE_COPY[visualType].subject,
    bestUse: LOCAL_ASSET_PROFILE_COPY[visualType].bestUse,
    confidence: 0.45,
    reasoning: 'Local filename and aspect-ratio estimate before AI analysis.',
    source: 'local'
  };
};

const createImagePreviewDataUrl = (dataUrl: string, maxSide = 512): Promise<string> => new Promise((resolve) => {
  const image = new Image();
  image.onload = () => {
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) {
      resolve(dataUrl);
      return;
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    resolve(canvas.toDataURL('image/jpeg', 0.72));
  };
  image.onerror = () => resolve(dataUrl);
  image.src = dataUrl;
});

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
  { id: 'a3', label: 'A3', viewportLabel: 'A3_PRINT', width: 1123, height: 1587, defaultOrientation: 'portrait' },
  { id: 'a4', label: 'A4', viewportLabel: 'A4_PRINT', width: 794, height: 1123, defaultOrientation: 'portrait' },
];

const STAGE_TEMPLATE_MAP: Record<PageStage, string> = {
  discover: 'discover_context_mapping_16x9',
  define: 'define_concept_sketch_long_16x9',
  develop: 'develop_prototype_demo_16x9',
  deliver: 'deliver_final_outcome_16x9'
};

const getDefaultTemplateForStage = (stage: PageStage, presetId: CanvasPresetId) => (
  stage === 'discover' && presetId === 'strip-1800-768'
    ? 'discover_long_medical_strip'
    : STAGE_TEMPLATE_MAP[stage]
);

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
    aiGenerate: 'AI 生成',
    freeEdit: '自由编辑',
    reference: '1. 参考',
    template: '模板',
    ownReference: '上传参考',
    templateHelp: '选择 4 个阶段匹配的模板。',
    ownReferenceHelp: '上传自己的排版参考，AI 会先理解参考图并直接生成 JSON。',
    selectTemplate: '选择模板',
    uploadReference: '上传参考图',
    assets: '2. 素材',
    uploadImages: '上传图片',
    useTextAssets: '使用文字素材',
    useTextAssetsHelp: '开启后可以上传标题、正文和说明文字。',
    addText: '添加文字',
    generate: '生成排版',
    updateWithAI: 'AI 生成',
    aiEdit: '3. AI 修改',
    aiEditIntro: '你可以在这里和AI共同修改当前的模版',
    generateInfo: '第一次生成不需要输入提示词。选择参考方式并上传素材后，点击左下方生成排版。',
    aiPlaceholder: '描述希望 AI 修改的方向，例如：让图片更密集、减少文字、突出右侧主视觉...',
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
    aiGenerate: 'AI Generate',
    freeEdit: 'Free Edit',
    reference: '1. Reference',
    template: 'Template',
    ownReference: 'Upload Reference',
    templateHelp: 'Choose a template matched to the four stages.',
    ownReferenceHelp: 'Upload your own layout reference. AI reads it first and generates JSON directly.',
    selectTemplate: 'Select Template',
    uploadReference: 'Upload Reference Images',
    assets: '2. Assets',
    uploadImages: 'Upload Images',
    useTextAssets: 'Use Text Assets',
    useTextAssetsHelp: 'Enable this to upload titles, body copy, and captions.',
    addText: 'Add Text',
    generate: 'Generate Layout',
    updateWithAI: 'AI Generate',
    aiEdit: '3. AI Edit',
    aiEditIntro: 'You can revise the current template together with AI here.',
    generateInfo: 'No prompt is needed for the first generation. Choose a reference mode, upload assets, then use the bottom generate button.',
    aiPlaceholder: 'Describe how AI should revise the layout, e.g. make images denser, reduce text, emphasize the right hero image...',
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

const getGridMetrics = (preset: { width: number; height: number }) => {
  const safeAreaWidth = preset.width - (MARGIN * 2);
  const safeAreaHeight = preset.height - (MARGIN * 2);
  const colWidth = (safeAreaWidth - (COLUMNS - 1) * GUTTER) / COLUMNS;
  const rowHeight = (safeAreaHeight - (ROWS - 1) * GUTTER) / ROWS;
  const colUnit = colWidth + GUTTER;
  const rowUnit = rowHeight + GUTTER;

  return {
    safeAreaWidth,
    safeAreaHeight,
    colWidth,
    rowHeight,
    colUnit,
    rowUnit,
  };
};

const getPixelRect = (
  x: number,
  y: number,
  w: number,
  h: number,
  metrics: ReturnType<typeof getGridMetrics>
) => ({
  left: x * metrics.colUnit,
  top: y * metrics.rowUnit,
  width: w * metrics.colWidth + (w - 1) * GUTTER,
  height: h * metrics.rowHeight + (h - 1) * GUTTER
});

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
  const [blocks, setBlocks] = useState<LayoutBlock[]>(INITIAL_BLOCKS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [history, setHistory] = useState<LayoutBlock[][]>([]);
  const [future, setFuture] = useState<LayoutBlock[][]>([]);
  const blocksRef = useRef<LayoutBlock[]>(INITIAL_BLOCKS);
  const [showGrid, setShowGrid] = useState(true);
  const [zoom, setZoom] = useState(0.85);
  const [isLocked, setIsLocked] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('editorial');
  const [language, setLanguage] = useState<Language>('zh');
  const [showGuide, setShowGuide] = useState(() => localStorage.getItem('gridSysGuideSeen') !== '1');
  const [canvasPresetId, setCanvasPresetId] = useState<CanvasPresetId>('digital-16-9');
  const [canvasOrientation, setCanvasOrientation] = useState<CanvasOrientation>('landscape');
  const canvasPreset = useMemo(
    () => CANVAS_PRESETS.find(preset => preset.id === canvasPresetId) || CANVAS_PRESETS[0],
    [canvasPresetId]
  );
  const canvasSize = useMemo(
    () => resolveCanvasSize(canvasPreset, canvasOrientation),
    [canvasPreset, canvasOrientation]
  );
  const canvasViewportLabel = `${canvasPreset.viewportLabel}_${canvasOrientation.toUpperCase()}`;
  const gridMetrics = useMemo(() => getGridMetrics(canvasSize), [canvasSize]);
  const workspaceRef = useRef<HTMLElement>(null);
  
  // 素材池与 AI 生成状态
  const [imageAssets, setImageAssets] = useState<ImageAsset[]>([]);
  const [textAssets, setTextAssets] = useState<TextAsset[]>([]);
  const [newTextAsset, setNewTextAsset] = useState('');
  const [newTextRole, setNewTextRole] = useState<TextAssetRole>('body');
  const [chatMessages, setChatMessages] = useState<{role:'user'|'ai', text:string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [availableTemplates, setAvailableTemplates] = useState<TemplateJSON[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<'auto' | string>(getDefaultTemplateForStage('discover', 'digital-16-9'));
  const [uploadedReferenceTemplate, setUploadedReferenceTemplate] = useState<TemplateJSON | null>(null);
  const [lastRenderJSON, setLastRenderJSON] = useState<RenderJSON | null>(null);
  const [pendingLayoutPreview, setPendingLayoutPreview] = useState<LayoutPreviewState | null>(null);
  const [assetAnalysisPendingIds, setAssetAnalysisPendingIds] = useState<string[]>([]);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('generate');
  const [pageStage, setPageStage] = useState<PageStage>('discover');
  const [referenceMode, setReferenceMode] = useState<ReferenceMode>('template');
  const [textAssetsEnabled, setTextAssetsEnabled] = useState(false);
  const [referenceTemplateLoading, setReferenceTemplateLoading] = useState(false);
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
  const safeAreaRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<{ startX: number, startY: number } | null>(null);
  const dragRef = useRef<{
    ids: string[]
    startMouseX: number
    startMouseY: number
    startPositions: Record<string, { x: number, y: number }>
  } | null>(null);
  const textDragTimerRef = useRef<number | null>(null);
  const resizeRef = useRef<{
    id: string
    startMouseX: number
    startMouseY: number
    startW: number
    startH: number
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
    setEditingTextId(null);
    setHistory([]);
    setFuture([]);
    setLastRenderJSON(null);
    setPendingLayoutPreview(null);
    setChatMessages([]);
    setChatInput('');
  };

  const selectOnly = (id: string | null) => {
    setSelectedId(id);
    setSelectedIds(id ? [id] : []);
    setEditingTextId(prev => (prev && prev !== id ? null : prev));
  };

  const updateBlock = (id: string, updates: Partial<LayoutBlock>, remember = false) => {
    if (remember) rememberBlocks();
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  };

  const selectCanvasPreset = (preset: typeof CANVAS_PRESETS[number]) => {
    setCanvasPresetId(preset.id);
    setCanvasOrientation(preset.defaultOrientation);
    if (referenceMode === 'template' && pageStage === 'discover') {
      setSelectedTemplateId(getDefaultTemplateForStage('discover', preset.id));
    }
  };

  const selectPageStage = (stage: PageStage) => {
    setPageStage(stage);
    setSelectedTemplateId(getDefaultTemplateForStage(stage, canvasPresetId));
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

  useEffect(() => {
    loadAllTemplates()
      .then(setAvailableTemplates)
      .catch(error => {
        setChatMessages(prev => [...prev, { role: 'ai', text: `模板加载失败: ${error.message}` }]);
      });
  }, []);

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
      while (newY + block.h <= ROWS) {
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
      )
    };

    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
  };

  const clearTextDragTimer = () => {
    if (textDragTimerRef.current) {
      window.clearTimeout(textDragTimerRef.current);
      textDragTimerRef.current = null;
    }
  };

  const handleTextBlockMouseDown = (e: React.MouseEvent, block: LayoutBlock) => {
    e.stopPropagation();
    if (isLocked || isInteractiveTarget(e.target)) return;
    selectOnly(block.id);
    if (editingTextId === block.id) return;

    const event = e;
    clearTextDragTimer();
    textDragTimerRef.current = window.setTimeout(() => {
      textDragTimerRef.current = null;
      setEditingTextId(null);
      handleDragStart(event, block.id);
    }, 260);
    window.addEventListener('mouseup', clearTextDragTimer, { once: true });
  };

  const handleDragMove = (e: MouseEvent) => {
    if (!dragRef.current) return;
    const { ids, startMouseX, startMouseY, startPositions } = dragRef.current;
    const currentBlocks = blocksRef.current;
    const leadId = ids[0];
    const block = currentBlocks.find(b => b.id === leadId);
    if (!block) return;

    const dx = Math.round((e.clientX - startMouseX) / zoom / gridMetrics.colUnit);
    const dy = Math.round((e.clientY - startMouseY) / zoom / gridMetrics.rowUnit);
    const selectedBlocks = currentBlocks.filter(b => ids.includes(b.id));
    const minDx = Math.max(...selectedBlocks.map(b => -startPositions[b.id].x));
    const maxDx = Math.min(...selectedBlocks.map(b => COLUMNS - b.w - startPositions[b.id].x));
    const minDy = Math.max(...selectedBlocks.map(b => -startPositions[b.id].y));
    const maxDy = Math.min(...selectedBlocks.map(b => ROWS - b.h - startPositions[b.id].y));
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
          const blockRect = getPixelRect(block.x, block.y, block.w, block.h, gridMetrics);
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

    const dw = Math.round((e.clientX - startMouseX) / zoom / gridMetrics.colUnit);
    const dh = Math.round((e.clientY - startMouseY) / zoom / gridMetrics.rowUnit);

    const newW = Math.max(1, Math.min(COLUMNS - block.x, startW + dw));
    const newH = Math.max(1, Math.min(ROWS - block.y, startH + dh));

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

  const exportSVG = () => {
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
      const x = MARGIN + block.x * (gridMetrics.colWidth + GUTTER);
      const y = MARGIN + block.y * (gridMetrics.rowHeight + GUTTER);
      const w = block.w * gridMetrics.colWidth + (block.w - 1) * GUTTER;
      const h = block.h * gridMetrics.rowHeight + (block.h - 1) * GUTTER;
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
    const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `gridsys_layout_${canvasViewportLabel.toLowerCase()}.svg`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleZoom = (delta: number) => {
    setZoom(prev => Math.min(Math.max(prev + delta, 0.4), 1.5));
  };

  const analyzeImageAssetsWithAI = async (assets: ImageAsset[]) => {
    const analyzableAssets = assets.filter(asset => asset.role !== 'reference');
    if (!analyzableAssets.length) return;
    const analyzingIds = analyzableAssets.map(asset => asset.id);
    setAssetAnalysisPendingIds(prev => Array.from(new Set([...prev, ...analyzingIds])));

    try {
      const previewAssets = await Promise.all(analyzableAssets.map(async asset => ({
        id: asset.id,
        name: asset.name,
        role: asset.role,
        width: asset.width,
        height: asset.height,
        assetProfile: asset.assetProfile,
        dataUrl: await createImagePreviewDataUrl(asset.dataUrl)
      })));
      const response = await fetch('/api/generate-layout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'analyze-assets',
          imageAssets: previewAssets
        })
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Asset analysis failed.');
      }
      const profileMap = new Map<string, AssetProfile>(
        (result.assetProfiles || []).map((profile: AssetProfile & { assetId: string }) => [
          profile.assetId,
          {
            visualType: profile.visualType,
            informationDensity: profile.informationDensity,
            recommendedRole: profile.recommendedRole,
            subject: profile.subject,
            bestUse: profile.bestUse,
            confidence: profile.confidence,
            reasoning: profile.reasoning,
            source: 'ai'
          }
        ])
      );
      setImageAssets(prev => prev.map(asset => {
        const profile = profileMap.get(asset.id);
        if (!profile) return asset;
        return {
          ...asset,
          assetProfile: profile,
          role: asset.role === 'supporting_image' || asset.assetProfile?.source === 'local'
            ? profile.recommendedRole
            : asset.role
        };
      }));
    } catch (err: any) {
      setChatMessages(prev => [...prev, {
        role: 'ai',
        text: language === 'zh'
          ? `图片理解暂时不可用，已使用本地初始标签继续：${err.message}`
          : `Image understanding is unavailable for now. Local asset profiles will be used: ${err.message}`
      }]);
    } finally {
      setAssetAnalysisPendingIds(prev => prev.filter(id => !analyzingIds.includes(id)));
    }
  };

  const readImageAsset = (
    file: File,
    indexInBatch: number,
    forcedRole?: ImageAssetRole
  ): Promise<ImageAsset> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const image = new Image();
      image.onload = () => {
        const fallbackRole = forcedRole || (imageAssets.length + indexInBatch === 0 ? 'hero_image' : 'supporting_image');
        const assetProfile = forcedRole === 'reference'
          ? undefined
          : inferLocalAssetProfile(file.name, image.naturalWidth, image.naturalHeight, fallbackRole as Exclude<ImageAssetRole, 'reference'>);
        resolve({
          id: createLocalId(),
          name: file.name.replace(/\.[^.]+$/, ''),
          dataUrl,
          role: forcedRole || assetProfile?.recommendedRole || fallbackRole,
          width: image.naturalWidth,
          height: image.naturalHeight,
          assetProfile
        });
      };
      image.onerror = () => reject(new Error(`Failed to read image: ${file.name}`));
      image.src = dataUrl;
    };
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });

  const handleImageAssetUpload = (files: FileList | File[], forcedRole?: ImageAssetRole) => {
    const nextFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    const limitedFiles = nextFiles.slice(0, Math.max(0, 24 - imageAssets.length));
    void Promise.all(limitedFiles.map((file, index) => readImageAsset(file, index, forcedRole)))
      .then(nextAssets => {
        setImageAssets(prev => [...prev, ...nextAssets]);
        if (!forcedRole) {
          void analyzeImageAssetsWithAI(nextAssets);
        }
      })
      .catch((err: Error) => {
        setChatMessages(prev => [...prev, {
          role: 'ai',
          text: language === 'zh' ? `图片读取失败：${err.message}` : `Image upload failed: ${err.message}`
        }]);
      });
  };

  const updateAssetProfile = (assetId: string, updates: Partial<AssetProfile>) => {
    setImageAssets(prev => prev.map(asset => {
      if (asset.id !== assetId) return asset;
      const currentProfile = asset.assetProfile || inferLocalAssetProfile(asset.name, asset.width, asset.height, asset.role === 'reference' ? 'supporting_image' : asset.role);
      const visualType = updates.visualType || currentProfile.visualType;
      const recommendedRole = updates.recommendedRole || (
        updates.visualType ? VISUAL_TYPE_ROLE_MAP[visualType] : currentProfile.recommendedRole
      );
      const nextProfile: AssetProfile = {
        ...currentProfile,
        ...updates,
        visualType,
        recommendedRole,
        source: 'ai'
      };

      return {
        ...asset,
        role: asset.role === 'reference' ? asset.role : recommendedRole,
        assetProfile: nextProfile
      };
    }));
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

  const buildContentJSON = (userMessage: string, detectedStage: string): ContentJSON => {
    const enabledTextAssets = textAssetsEnabled ? textAssets : [];
    const layoutImages = imageAssets.filter(asset => asset.role !== 'reference');
    const titleAsset = enabledTextAssets.find(asset => asset.role === 'title');
    const subtitleAsset = enabledTextAssets.find(asset => asset.role === 'subtitle');
    const bodyAssets = enabledTextAssets.filter(asset => asset.role === 'body');
    const captionAsset = enabledTextAssets.find(asset => asset.role === 'caption');
    const labelAsset = enabledTextAssets.find(asset => asset.role === 'label');
    const heroImage = layoutImages.find(asset => asset.role === 'hero_image') || layoutImages[0];
    const supportImages = layoutImages.filter(asset => asset.id !== heroImage?.id);
    const diagramImage = layoutImages.find(asset => asset.role === 'diagram_image') || supportImages[0];
    const chartImage = layoutImages.find(asset => asset.role === 'data_visualization') || supportImages[1] || diagramImage;
    const portraitImage = layoutImages.find(asset => asset.role === 'portrait_image') || supportImages[2] || heroImage;
    const productImage = layoutImages.find(asset => asset.role === 'product_image') || supportImages[3] || heroImage;
    const backgroundImage = layoutImages.find(asset => asset.role === 'background_image') || heroImage;
    const iconImage = layoutImages.find(asset => asset.role === 'icon_image') || supportImages[4] || diagramImage;
    const combinedText = [userMessage, ...enabledTextAssets.map(asset => asset.content)].join('\n');
    const statistic = combinedText.match(/\b\d+(?:\.\d+)?%|\b\d+(?:,\d{3})*(?:\.\d+)?\b/)?.[0];

    return {
      projectId: 'local_project',
      stage: detectedStage,
      contentTypes: textAssets.map(asset => asset.role),
      content: {
        page_title: titleAsset?.content || subtitleAsset?.content || userMessage.split('\n')[0] || 'Portfolio Page',
        background_summary: bodyAssets[0]?.content || userMessage,
        section_heading: labelAsset?.content || 'Evidence Mapping',
        evidence_caption: captionAsset?.content || bodyAssets[1]?.content || userMessage,
        research_question: textAssets.find(asset => asset.content.toLowerCase().includes('how might we'))?.content || 'How might we frame the opportunity?',
        inspiration_title: titleAsset?.content || userMessage.split('\n')[0] || 'Research Background',
        inspiration_subtitle: subtitleAsset?.content || labelAsset?.content || 'Context and research origin',
        inspiration_body_summary: bodyAssets[0]?.content || userMessage,
        documentary_caption_left: captionAsset?.content || bodyAssets[1]?.content,
        documentary_caption_right: bodyAssets[2]?.content || captionAsset?.content,
        user_identification_title: 'User Identification',
        early_user_note: bodyAssets[1]?.content || bodyAssets[0]?.content,
        core_user_note: bodyAssets[2]?.content || bodyAssets[0]?.content,
        late_user_note: bodyAssets[3]?.content || bodyAssets[0]?.content,
        target_group: labelAsset?.content || subtitleAsset?.content || bodyAssets[0]?.content,
        manifestations_title: 'Manifestations & Pain Points',
        manifestations_body_summary: bodyAssets[1]?.content || bodyAssets[0]?.content,
        symptom_blurred_vision: statistic,
        symptom_word_overlap: statistic,
        symptom_difficulty_spelling: statistic,
        symptom_letter_confusion: statistic,
        manifestations_summary: bodyAssets[2]?.content || userMessage,
        negative_effect_title: 'Negative Effect',
        findings_title: 'Findings',
        finding_multi_sensory_title: labelAsset?.content || 'Finding 01',
        finding_multi_sensory_summary: bodyAssets[1]?.content || userMessage,
        finding_customized_guidance_title: 'Finding 02',
        finding_customized_guidance_summary: bodyAssets[2]?.content || bodyAssets[0]?.content,
        finding_systematic_teaching_title: 'Finding 03',
        finding_systematic_teaching_summary: bodyAssets[3]?.content || bodyAssets[0]?.content,
        context_text: subtitleAsset?.content || bodyAssets[0]?.content || userMessage,
        function_text: bodyAssets[0]?.content || userMessage,
        usage_text: bodyAssets[1]?.content || captionAsset?.content || userMessage,
        image_caption: captionAsset?.content,
        key_statistic: statistic,
        context_visual: heroImage?.id,
        category_collage_image: backgroundImage?.id,
        category_summary_image: diagramImage?.id || heroImage?.id,
        context_visual_a: portraitImage?.id || heroImage?.id,
        context_visual_b: productImage?.id || supportImages[0]?.id || heroImage?.id,
        statistic_image_a: chartImage?.id || heroImage?.id,
        statistic_image_b: diagramImage?.id || supportImages[1]?.id || heroImage?.id,
        statistic_image_c: iconImage?.id || supportImages[2]?.id || heroImage?.id,
        statistic_image_d: supportImages[3]?.id || heroImage?.id,
        case_image_a: portraitImage?.id || supportImages[0]?.id || heroImage?.id,
        case_image_b: productImage?.id || supportImages[1]?.id || heroImage?.id,
        case_image_c: diagramImage?.id || supportImages[2]?.id || heroImage?.id,
        case_image_d: supportImages[3]?.id || heroImage?.id,
        documentary_image_left: portraitImage?.id || supportImages[0]?.id || heroImage?.id,
        documentary_image_right: productImage?.id || supportImages[1]?.id || heroImage?.id,
        age_0_6_child_image: portraitImage?.id || heroImage?.id,
        age_0_6_curve_diagram: diagramImage?.id || supportImages[0]?.id || heroImage?.id,
        age_6_15_child_image: portraitImage?.id || supportImages[1]?.id || heroImage?.id,
        age_6_15_curve_diagram: chartImage?.id || supportImages[2]?.id || heroImage?.id,
        age_above_15_child_image: portraitImage?.id || supportImages[3]?.id || heroImage?.id,
        age_above_15_curve_diagram: diagramImage?.id || supportImages[4]?.id || heroImage?.id,
        manifestations_child_image: portraitImage?.id || heroImage?.id,
        brain_illustration: diagramImage?.id || supportImages[0]?.id || heroImage?.id,
        negative_effect_emotional_group: portraitImage?.id || supportImages[1]?.id || heroImage?.id,
        negative_effect_neurological_group: diagramImage?.id || supportImages[2]?.id || heroImage?.id,
        negative_effect_support_group: supportImages[3]?.id || heroImage?.id,
        hero_usage_image: heroImage?.id,
        main_usage_image: heroImage?.id,
        secondary_usage_image: supportImages[0]?.id,
        component_image: supportImages[1]?.id || supportImages[0]?.id,
        material_detail_image: supportImages[2]?.id || supportImages[1]?.id,
        hero_outcome_image: heroImage?.id,
        component_spread_image: supportImages[0]?.id || heroImage?.id,
        testing_image_a: supportImages[1]?.id || heroImage?.id,
        testing_image_b: supportImages[2]?.id || supportImages[0]?.id,
        scenario_image_foot: supportImages[3]?.id || supportImages[0]?.id,
        scenario_image_hands: supportImages[4]?.id || supportImages[1]?.id,
        scenario_image_arm: supportImages[5]?.id || supportImages[2]?.id,
        module_card_foot: supportImages[6]?.id || supportImages[0]?.id,
        module_card_hands: supportImages[7]?.id || supportImages[1]?.id,
        module_card_arm: supportImages[8]?.id || supportImages[2]?.id,
        diagram_overlay_image: supportImages[9]?.id || supportImages[0]?.id,
        participant_a_feedback: captionAsset?.content || bodyAssets[0]?.content,
        participant_b_feedback: bodyAssets[1]?.content,
        participant_c_feedback: bodyAssets[2]?.content,
        participant_d_feedback: bodyAssets[3]?.content
      }
    };
  };

  const hydrateRenderJSONImages = (renderJSON: RenderJSON): RenderJSON => ({
    ...renderJSON,
    elements: renderJSON.elements.map(element => {
      if (element.type !== 'image') return element;
      const asset = imageAssets.find(item => item.id === element.src);
      return asset ? { ...element, src: asset.dataUrl } : element;
    })
  });

  const buildTemplatePreviewRenderJSON = (template: TemplateJSON, userMessage: string): RenderJSON => {
    void userMessage;
    const imageRoleLabel = (role: string) => {
      if (/portrait|participant|user|interview/i.test(role)) return language === 'zh' ? '人物、用户或访谈照片' : 'portrait, user, or interview photo';
      if (/chart|data|stat|visualization/i.test(role)) return language === 'zh' ? '数据图表、统计图或信息图' : 'chart, statistic, or infographic';
      if (/diagram|map|flow|system|process/i.test(role)) return language === 'zh' ? '结构图、流程图或系统图' : 'diagram, map, or process visual';
      if (/product|prototype|component|material|outcome/i.test(role)) return language === 'zh' ? '产品、原型、组件或材料照片' : 'product, prototype, component, or material photo';
      if (/hero|background|context/i.test(role)) return language === 'zh' ? '清晰主视觉、场景图或背景图' : 'clear hero, context, or background image';
      return language === 'zh' ? '与该槽位语义匹配的图片' : 'image matching this slot intent';
    };
    const textSlotLabel = (element: NonNullable<TemplateJSON['elements']>[number], index: number) => {
      const role = `${element.role} ${element.slotId} ${element.style || ''}`.toLowerCase();
      if (element.style === 'title' || /title|headline|hero/.test(role)) {
        return language === 'zh' ? '页面主标题：概括本页调研主题或核心问题' : 'Page title: summarize the research topic or core question';
      }
      if (element.style === 'heading' || /heading|section|subtitle/.test(role)) {
        return language === 'zh' ? '章节标题：标注这一组信息的调研维度' : 'Section heading: name this research dimension';
      }
      if (element.type === 'caption' || /caption|note|annotation|label/.test(role)) {
        return language === 'zh' ? '说明文字：解释图片、数据或关键发现' : 'Caption: explain the image, data, or key finding';
      }
      if (/question|hmw|opportunity/.test(role)) {
        return language === 'zh' ? '机会点文本：放设计问题、洞察或 How Might We' : 'Opportunity text: design question, insight, or HMW';
      }
      if (/data|stat|evidence|finding/.test(role)) {
        return language === 'zh' ? '证据文本：放调研数据、发现或论据摘要' : 'Evidence text: research data, finding, or proof summary';
      }
      if (/user|participant|interview/.test(role)) {
        return language === 'zh' ? '用户文本：放用户画像、访谈摘录或行为洞察' : 'User text: persona, interview quote, or behavior insight';
      }
      return language === 'zh' ? `正文文本 ${index + 1}：放调研背景、分析或结论摘要` : `Body text ${index + 1}: research background, analysis, or conclusion summary`;
    };
    const generatedTextForSlot = (element: NonNullable<TemplateJSON['elements']>[number], index: number) => {
      if (element.type === 'image') {
        return `${language === 'zh' ? '图片槽位' : 'Image slot'}\n${imageRoleLabel(element.role)}\n${language === 'zh' ? '不匹配可留空或稍后替换' : 'Leave blank if no matching asset exists'}`;
      }
      return textSlotLabel(element, index);
    };

    return {
      templateId: `${template.templateMeta.templateId}_preview`,
      canvas: {
        width: template.grid.columns,
        height: template.grid.rows
      },
      elements: (template.elements || []).map((element, index) => {
      const isImageSlot = element.type === 'image';
      return {
        type: isImageSlot ? 'caption' : element.type,
        id: `preview_${element.slotId}`,
        x: element.x,
        y: element.y,
        w: element.w,
        h: element.h,
        style: isImageSlot ? 'caption' : element.style,
        crop: element.crop,
        zIndex: element.zIndex || index + 1,
        content: generatedTextForSlot(element, index),
        textRules: {
          maxChars: isImageSlot ? 72 : 72,
          fontSize: isImageSlot ? 8 : Math.min(element.textRules?.fontSize || 10, 10),
          lineClamp: isImageSlot ? 4 : 3,
          overflow: 'clip',
          padding: isImageSlot ? 4 : 5
        }
      };
    })
    };
  };

  const getPreviewTemplate = () => {
    if (referenceMode === 'upload') return uploadedReferenceTemplate;
    const fallbackTemplateId = selectedTemplateId === 'auto'
      ? getDefaultTemplateForStage(pageStage, canvasPresetId)
      : selectedTemplateId;
    return availableTemplates.find(template => template.templateMeta.templateId === fallbackTemplateId)
      || availableTemplates.find(template => template.templateMeta.doubleDiamondStage === pageStage)
      || availableTemplates[0];
  };

  const buildPreviewPlanFromBlocks = (): PreviewPlanItem[] => blocks.reduce<PreviewPlanItem[]>((plan, block) => {
      const match = block.id.match(/^preview_(.+)-\d+$/);
      if (!match) return plan;
      plan.push({
        slotId: match[1],
        type: block.type,
        x: block.x,
        y: block.y,
        w: block.w,
        h: block.h,
        note: block.label,
        fontSize: block.fontSize,
        lineClamp: block.lineClamp
      });
      return plan;
    }, []);

  const generateUploadedReferenceTemplate = async () => {
    const referenceImageAssets = imageAssets.filter(asset => asset.role === 'reference');
    if (!referenceImageAssets.length) {
      setChatMessages(prev => [...prev, {
        role: 'ai',
        text: language === 'zh' ? '请先上传参考图。' : 'Please upload a reference image first.'
      }]);
      return;
    }

    setReferenceTemplateLoading(true);
    try {
      const response = await fetch('/api/generate-layout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'generate-reference-template',
          canvasPresetId,
          prompt: language === 'zh'
            ? '只分析参考图的版式结构，生成可复用模板。'
            : 'Analyze only the reference layout structure and generate a reusable template.',
          referenceMode: 'upload',
          referenceImages: referenceImageAssets.map(asset => ({
            id: asset.id,
            name: asset.name,
            role: asset.role,
            width: asset.width,
            height: asset.height,
            dataUrl: asset.dataUrl
          }))
        })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || '参考模板生成失败。');
      }

      rememberBlocks();
      setUploadedReferenceTemplate(result.referenceTemplate);
      setPendingLayoutPreview(null);
      setLastRenderJSON(result.renderJSON);
      setBlocks(renderJSONToLayoutBlocks(result.renderJSON));
      selectOnly(null);
      setChatMessages(prev => [...prev, {
        role: 'ai',
        text: language === 'zh'
          ? `参考模板已生成：${result.referenceTemplate?.elements?.length || 0} 个槽位。下一步可以生成排版，让 AI 分配图片和文本。`
          : `Reference template generated with ${result.referenceTemplate?.elements?.length || 0} slots. Next, generate the layout to assign images and text.`
      }]);
    } catch (err: any) {
      setChatMessages(prev => [...prev, { role: 'ai', text: `参考模板生成失败: ${err.message}` }]);
    } finally {
      setReferenceTemplateLoading(false);
    }
  };

  const showTemplatePreviewBeforeLayout = (userMessage: string) => {
    const template = getPreviewTemplate();
    if (!template) {
      throw new Error(language === 'zh' ? '模板还没有加载完成，请稍后再试。' : 'Templates are still loading.');
    }

    const previewRenderJSON = buildTemplatePreviewRenderJSON(template, userMessage);
    rememberBlocks();
    setLayoutMode('editorial');
    setLastRenderJSON(previewRenderJSON);
    setPendingLayoutPreview({
      prompt: userMessage,
      templateId: template.templateMeta.templateId,
      referenceMode
    });
    setBlocks(renderJSONToLayoutBlocks(previewRenderJSON));
    selectOnly(null);
    setChatMessages(prev => [...prev, {
      role: 'ai',
      text: language === 'zh'
        ? `已先展示模板骨架：${template.templateMeta.templateName}。请检查槽位逻辑，确认后再完成最终排版。未匹配图片的槽位会先用文字说明需要的素材。`
        : `Template structure previewed: ${template.templateMeta.templateName}. Review the slot logic first, then confirm the final layout. Unmatched image slots are labeled with the needed asset type.`
    }]);
  };

  const callGeminiLayout = async (userMessage: string, confirmedFinalLayout = false) => {
    setAiLoading(true);
    setChatMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setChatInput('');

    try {
      if (!availableTemplates.length) {
        throw new Error('模板还没有加载完成，请稍后再试。');
      }

      if (!confirmedFinalLayout && pendingLayoutPreview) {
        setChatMessages(prev => [...prev, {
          role: 'ai',
          text: language === 'zh'
            ? '请先使用画板下方的确认按钮完成最终排版。'
            : 'Use the confirmation button below the canvas to complete the final layout.'
        }]);
        return;
      }

      if (!confirmedFinalLayout && !lastRenderJSON) {
        showTemplatePreviewBeforeLayout(userMessage);
        return;
      }

      const analysis = analyzeProjectContent(userMessage);
      const contentJSON = buildContentJSON(userMessage, analysis.detectedStage);
      const layoutImageAssets = imageAssets.filter(asset => asset.role !== 'reference');
      const useOwnReference = referenceMode === 'upload';
      const referenceImageAssets = useOwnReference
        ? imageAssets.filter(asset => asset.role === 'reference')
        : [];
      if (useOwnReference && !uploadedReferenceTemplate) {
        throw new Error(language === 'zh' ? '请先生成参考模板，再生成排版。' : 'Generate the reference template before generating the layout.');
      }
      const response = await fetch('/api/generate-layout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: userMessage,
          selectedTemplateId: confirmedFinalLayout && pendingLayoutPreview ? pendingLayoutPreview.templateId : selectedTemplateId,
          canvasPresetId,
          referenceMode,
          customTemplate: useOwnReference ? uploadedReferenceTemplate : undefined,
          previewPlan: confirmedFinalLayout && pendingLayoutPreview ? buildPreviewPlanFromBlocks() : undefined,
          contentJSON,
          textAssets: (textAssetsEnabled ? textAssets : []).map(asset => ({
            id: asset.id,
            role: asset.role,
            content: asset.content
          })),
          imageAssets: layoutImageAssets.map(asset => ({
            id: asset.id,
            name: asset.name,
            role: asset.role,
            width: asset.width,
            height: asset.height,
            assetProfile: asset.assetProfile
          })),
          referenceImages: referenceImageAssets.map(asset => ({
            id: asset.id,
            name: asset.name,
            role: asset.role,
            width: asset.width,
            height: asset.height,
            dataUrl: asset.dataUrl
          }))
        })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'API 生成失败。');
      }

      const renderJSON = hydrateRenderJSONImages(result.renderJSON);
      const newBlocks = renderJSONToLayoutBlocks(renderJSON);
      const template = availableTemplates.find(item => item.templateMeta.templateId === result.selectedTemplate);

      rememberBlocks();
      setLayoutMode('editorial');
      setLastRenderJSON(renderJSON);
      setPendingLayoutPreview(null);
      setBlocks(newBlocks);
      selectOnly(null);
      setChatMessages(prev => [...prev, {
        role: 'ai',
        text: language === 'zh'
          ? `AI 已生成 Render JSON。参考方式：${useOwnReference ? '上传参考' : (template?.templateMeta.templateName || result.selectedTemplate)}。${result.reasoning || ''}`
          : `AI generated Render JSON. Reference mode: ${useOwnReference ? 'uploaded reference' : (template?.templateMeta.templateName || result.selectedTemplate)}. ${result.reasoning || ''}`
      }]);
    } catch (err: any) {
      setChatMessages(prev => [...prev, { role: 'ai', text: `生成失败: ${err.message}` }]);
    } finally {
      setAiLoading(false);
    }
  };

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
            >
              <motion.div 
                animate={{ left: showGrid ? '20px' : '2px' }}
                className="absolute top-[2px] w-3 h-3 bg-swiss-red" 
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
                onClick={() => setSidebarMode(mode.value)}
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
                <div className="mb-3 border border-swiss-black/10 bg-white/55 p-1">
                  {[
                    { value: 'template' as const, label: t.template, help: t.templateHelp },
                    { value: 'upload' as const, label: t.ownReference, help: t.ownReferenceHelp },
                  ].map(option => (
                    <button
                      key={option.value}
                      onClick={() => setReferenceMode(option.value)}
                      className={`inline-flex h-7 w-1/2 items-center justify-center text-[9px] font-black uppercase tracking-widest transition-colors ${
                        referenceMode === option.value
                          ? 'bg-swiss-black text-white'
                          : 'text-swiss-black/40 hover:text-swiss-red'
                      }`}
                      title={option.help}
                    >
                      {option.label}
                    </button>
                  ))}
                  <p className="px-1.5 pb-1.5 pt-2 text-[8px] leading-snug text-swiss-black/35">
                    {referenceMode === 'template' ? t.templateHelp : t.ownReferenceHelp}
                  </p>
                </div>

                {referenceMode === 'template' ? (
                  <>
                    <div className="grid grid-cols-2 gap-1">
                      {(['discover', 'define', 'develop', 'deliver'] as PageStage[]).map(stage => {
                        const templateId = getDefaultTemplateForStage(stage, canvasPresetId);
                        const template = availableTemplates.find(item => item.templateMeta.templateId === templateId);
                        return (
                          <button
                            key={stage}
                            onClick={() => selectPageStage(stage)}
                            className={`min-h-12 border p-2 text-left transition-colors ${
                              pageStage === stage
                                ? 'bg-swiss-red text-white border-swiss-red'
                                : 'bg-white/60 text-swiss-black border-swiss-black/10 hover:border-swiss-red'
                            }`}
                          >
                            <span className="block text-[10px] font-black uppercase tracking-widest">{t.stages[stage]}</span>
                            <span className={`block mt-1 text-[8px] leading-tight ${
                              pageStage === stage ? 'text-white/75' : 'text-swiss-black/35'
                            }`}>
                              {template ? template.templateMeta.templateName : stage === 'define' ? t.autoMatch : t.loading}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <select
                      value={selectedTemplateId}
                      onChange={(event) => setSelectedTemplateId(event.target.value)}
                      className="mt-2 w-full h-8 bg-white border border-swiss-black/10 px-2 text-[10px] font-black uppercase outline-none focus:border-swiss-red"
                    >
                      <option value="auto">{t.selectTemplate}</option>
                      {availableTemplates.map(template => (
                        <option key={template.templateMeta.templateId} value={template.templateMeta.templateId}>
                          {template.templateMeta.templateName}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <div className="border-t border-swiss-black/10 pt-3">
                    <button
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/*';
                        input.multiple = true;
                        input.onchange = (event) => {
                          setUploadedReferenceTemplate(null);
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
                              setUploadedReferenceTemplate(null);
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
                    <button
                      onClick={generateUploadedReferenceTemplate}
                      disabled={referenceTemplateLoading || imageAssets.filter(asset => asset.role === 'reference').length === 0}
                      className="mt-3 w-full h-9 bg-swiss-black text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:bg-swiss-red transition-colors"
                    >
                      {referenceTemplateLoading
                        ? (language === 'zh' ? '正在生成模板...' : 'Generating Template...')
                        : uploadedReferenceTemplate
                          ? (language === 'zh' ? '重新生成参考模板' : 'Regenerate Template')
                          : (language === 'zh' ? '生成参考模板' : 'Generate Reference Template')}
                    </button>
                    <div className={`mt-2 border p-2 text-[9px] leading-snug ${
                      uploadedReferenceTemplate
                        ? 'border-swiss-red/25 bg-swiss-red/5 text-swiss-black/65'
                        : 'border-swiss-black/10 bg-white/50 text-swiss-black/35'
                    }`}>
                      {uploadedReferenceTemplate
                        ? (language === 'zh'
                          ? `模板已准备：${uploadedReferenceTemplate.elements?.length || 0} 个槽位。下一步点击底部生成排版。`
                          : `Template ready: ${uploadedReferenceTemplate.elements?.length || 0} slots. Next, click Generate Layout below.`)
                        : (language === 'zh'
                          ? '先生成参考模板，再让 AI 分配图片和文字。'
                          : 'Generate the reference template first, then let AI assign images and text.')}
                    </div>
                  </div>
                )}
              </CollapsibleSection>

              <CollapsibleSection
                title={t.assets}
                icon={<ImageIcon size={13} />}
                collapsed={collapsedSections.assets}
                onToggle={() => toggleSection('assets')}
                meta={`${imageAssets.filter(asset => asset.role !== 'reference').length} IMG${textAssetsEnabled ? ` / ${textAssets.length} TXT` : ''}`}
              >
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
                <div className="mt-3 space-y-2">
                  {imageAssets.filter(asset => asset.role !== 'reference').map(asset => {
                    const profile = asset.assetProfile || inferLocalAssetProfile(asset.name, asset.width, asset.height, asset.role === 'reference' ? 'supporting_image' : asset.role);
                    const isAnalyzing = assetAnalysisPendingIds.includes(asset.id);
                    const confidence = profile.confidence === undefined ? null : Math.round(profile.confidence * 100);

                    return (
                      <div key={asset.id} className="group border border-swiss-black/10 bg-white/70 p-2">
                        <div className="flex gap-2">
                          <div className="relative shrink-0">
                            <img src={asset.dataUrl} alt={asset.name} className="h-16 w-16 object-cover border border-swiss-black/10" />
                            <button
                              onClick={() => setImageAssets(prev => prev.filter(item => item.id !== asset.id))}
                              className="absolute top-1 right-1 w-5 h-5 bg-swiss-red text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                              title={language === 'zh' ? '移除图片' : 'Remove image'}
                            >
                              <X size={12} />
                            </button>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-[9px] font-black uppercase tracking-widest text-swiss-black/65">{asset.name}</p>
                                <p className="mt-0.5 text-[8px] font-bold uppercase tracking-widest text-swiss-black/35">
                                  {isAnalyzing
                                    ? (language === 'zh' ? 'AI 理解中' : 'AI reading')
                                    : `${profile.source === 'ai' ? 'AI' : 'LOCAL'}${confidence === null ? '' : ` ${confidence}%`}`}
                                </p>
                              </div>
                              <span className={`shrink-0 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest ${
                                profile.informationDensity === 'high'
                                  ? 'bg-swiss-red text-white'
                                  : 'bg-swiss-black/5 text-swiss-black/45'
                              }`}>
                                {profile.informationDensity}
                              </span>
                            </div>

                            <div className="mt-2 grid grid-cols-3 gap-1">
                              <select
                                value={profile.visualType}
                                onChange={(event) => updateAssetProfile(asset.id, { visualType: event.target.value as AssetVisualType })}
                                className="h-7 min-w-0 bg-white border border-swiss-black/10 px-1 text-[8px] font-black uppercase outline-none focus:border-swiss-red"
                                title={language === 'zh' ? 'AI 判断的图片类型' : 'AI visual type'}
                              >
                                {ASSET_VISUAL_TYPE_OPTIONS.map(option => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              <select
                                value={profile.informationDensity}
                                onChange={(event) => updateAssetProfile(asset.id, { informationDensity: event.target.value as AssetInformationDensity })}
                                className="h-7 min-w-0 bg-white border border-swiss-black/10 px-1 text-[8px] font-black uppercase outline-none focus:border-swiss-red"
                                title={language === 'zh' ? '信息密度' : 'Information density'}
                              >
                                {ASSET_DENSITY_OPTIONS.map(option => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              <select
                                value={profile.recommendedRole}
                                onChange={(event) => updateAssetProfile(asset.id, { recommendedRole: event.target.value as Exclude<ImageAssetRole, 'reference'> })}
                                className="h-7 min-w-0 bg-white border border-swiss-black/10 px-1 text-[8px] font-black uppercase outline-none focus:border-swiss-red"
                                title={language === 'zh' ? '推荐角色' : 'Recommended role'}
                              >
                                {IMAGE_ROLE_OPTIONS.map(option => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="mt-1 space-y-0.5 text-[8px] leading-snug text-swiss-black/40">
                              {profile.subject && (
                                <p className="line-clamp-1">
                                  <span className="font-black text-swiss-black/55">{language === 'zh' ? '内容' : 'Subject'}:</span> {profile.subject}
                                </p>
                              )}
                              {profile.bestUse && (
                                <p className="line-clamp-1">
                                  <span className="font-black text-swiss-black/55">{language === 'zh' ? '适合' : 'Use'}:</span> {profile.bestUse}
                                </p>
                              )}
                              {profile.reasoning && (
                                <p className="line-clamp-1">
                                  <span className="font-black text-swiss-black/55">{language === 'zh' ? '理由' : 'Why'}:</span> {profile.reasoning}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 border-t border-swiss-black/10 pt-3">
                  <button
                    onClick={() => setTextAssetsEnabled(prev => !prev)}
                    className="w-full flex items-center justify-between text-left"
                  >
                    <span>
                      <span className="block text-[9px] font-black uppercase tracking-widest text-swiss-black/55">{t.useTextAssets}</span>
                      <span className="block mt-1 text-[9px] leading-tight text-swiss-black/35">
                        {t.useTextAssetsHelp}
                      </span>
                    </span>
                    <span className={`relative block w-9 h-4.5 border transition-colors ${
                      textAssetsEnabled ? 'bg-swiss-red border-swiss-red' : 'bg-white border-swiss-black/20'
                    }`}>
                      <span className={`absolute top-[2px] w-3 h-3 bg-swiss-black transition-all ${
                        textAssetsEnabled ? 'left-[20px] bg-white' : 'left-[2px]'
                      }`} />
                    </span>
                  </button>
                  {textAssetsEnabled && (
                    <div className="mt-3">
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
                    </div>
                  )}
                </div>
              </CollapsibleSection>

              <CollapsibleSection
                title={lastRenderJSON ? t.aiEdit : '3. AI'}
                icon={<Zap size={13} />}
                collapsed={collapsedSections.ai}
                onToggle={() => toggleSection('ai')}
                meta={aiLoading ? 'GENERATING' : lastRenderJSON ? 'PROMPT ON' : 'NO PROMPT'}
              >
                {lastRenderJSON ? (
                  <div className="border border-swiss-black/10 bg-white/70">
                    <div className="border-b border-swiss-black/10 p-3">
                      <p className="text-[10px] leading-snug text-swiss-black/55">
                        {t.aiEditIntro}
                      </p>
                    </div>
                    <div className="max-h-44 overflow-y-auto p-3 space-y-2">
                      {chatMessages.length === 0 ? (
                        <div className="border border-dashed border-swiss-black/15 bg-white/50 p-3 text-[10px] leading-snug text-swiss-black/35">
                          {language === 'zh' ? 'AI 的反馈会显示在这里。' : 'AI feedback will appear here.'}
                        </div>
                      ) : (
                        chatMessages.slice(-5).map((msg, index) => (
                          <div
                            key={`${msg.role}-${index}-${msg.text.slice(0, 12)}`}
                            className={`p-2 text-[10px] leading-snug border ${
                              msg.role === 'user'
                                ? 'ml-6 bg-[#111] border-[#111] text-white'
                                : 'mr-6 bg-swiss-red/10 border-swiss-red/20 text-swiss-black/75'
                            }`}
                          >
                            <span className={`block mb-1 text-[8px] font-black uppercase tracking-widest ${
                              msg.role === 'user' ? 'text-white/35' : 'text-swiss-red'
                            }`}>
                              {msg.role === 'user' ? (language === 'zh' ? '你' : 'You') : 'AI'}
                            </span>
                            {msg.text}
                          </div>
                        ))
                      )}
                    </div>
                    <div className="border-t border-swiss-black/10 p-2 bg-white">
                      <textarea
                        value={chatInput}
                        onChange={(event) => setChatInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && chatInput.trim() && !aiLoading) {
                            callGeminiLayout(chatInput.trim());
                          }
                        }}
                        placeholder={t.aiPlaceholder}
                        className="w-full h-20 resize-none bg-[#111] border border-[#333] text-white p-3 text-[11px] leading-snug outline-none focus:border-swiss-red placeholder:text-white/25"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="border border-swiss-black/10 bg-white/60 p-3">
                    <p className="text-[10px] leading-snug text-swiss-black/55">
                      {t.generateInfo}
                    </p>
                  </div>
                )}
                {lastRenderJSON && (
                  <div className="mt-2 border border-swiss-black/10 bg-white/60 p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-black uppercase tracking-widest text-swiss-black/35">Render JSON</span>
                      <span className="font-mono text-[8px] text-swiss-red">{lastRenderJSON.elements.length} elements</span>
                    </div>
                    <p className="mt-1 text-[9px] font-mono text-swiss-black/45 break-all">{lastRenderJSON.templateId}</p>
                  </div>
                )}
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
            onClick={() => {
              const defaultPrompt = language === 'zh'
                ? `根据当前选择的 ${referenceMode === 'template' ? `${pageStage} 模板` : '上传参考图'}，使用已上传图片${textAssetsEnabled ? '和文字素材' : ''}，生成一版作品集排版。`
                : `Generate a portfolio layout from the current ${referenceMode === 'template' ? `${pageStage} template` : 'uploaded reference image'}, using uploaded images${textAssetsEnabled ? ' and text assets' : ''}.`;
              const canUseDefaultPrompt = !lastRenderJSON || (referenceMode === 'upload' && Boolean(uploadedReferenceTemplate));
              const message = canUseDefaultPrompt ? (chatInput.trim() || defaultPrompt) : chatInput.trim();
              if (message && !aiLoading) callGeminiLayout(message);
            }}
            disabled={
              aiLoading ||
              referenceTemplateLoading ||
              (referenceMode === 'upload' && !uploadedReferenceTemplate) ||
              (Boolean(lastRenderJSON) && !chatInput.trim() && !(referenceMode === 'upload' && uploadedReferenceTemplate))
            }
            className="w-full h-11 bg-swiss-red text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:bg-swiss-red/85 transition-colors"
          >
            {pendingLayoutPreview
              ? (language === 'zh' ? '请在画板下方确认' : 'Confirm Below Canvas')
              : lastRenderJSON ? t.updateWithAI : t.generate}
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
            className="absolute left-0 top-0 shadow-2xl bg-white overflow-hidden transition-transform duration-300 ease-out"
            style={{
              width: canvasSize.width,
              height: canvasSize.height,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left'
            }}
          >
            <GridView
              showGrid={showGrid}
              label={canvasPreset.label}
              size={canvasSize}
              metrics={gridMetrics}
            />
            
            {/* Isolated Safe Area Wrapper: The strict bounding box */}
            <div 
              id="grid-safe-area"
              ref={safeAreaRef}
              className="absolute z-20 overflow-hidden"
              onMouseDown={handleSelectionStart}
              style={{ 
                top: `${MARGIN}px`, 
                left: `${MARGIN}px`, 
                width: `${gridMetrics.safeAreaWidth}px`,
                height: `${gridMetrics.safeAreaHeight}px`,
                boxSizing: 'border-box'
              }}
            >
              {selectionBox && (
                <div
                  className="absolute z-[70] pointer-events-none border border-swiss-red bg-swiss-red/10"
                  style={selectionBox}
                />
              )}
              {blocks.map(block => {
                const isDragging = dragPreview?.id === block.id;
                const isSelected = selectedIds.includes(block.id);
                const isTextLayer = isTextBlock(block.type);
                const isEditingText = editingTextId === block.id;
                const blockOverflowMode = block.overflowMode || (isTextLayer ? 'visible' : 'clip');
                const rect = isDragging 
                  ? getPixelRect(dragPreview!.x, dragPreview!.y, block.w, block.h, gridMetrics)
                  : getPixelRect(block.x, block.y, block.w, block.h, gridMetrics);
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
                      if (isInteractiveTarget(e.target)) return;
                      if (isTextLayer) {
                        handleTextBlockMouseDown(e, block);
                        return;
                      }
                      e.stopPropagation();
                      handleDragStart(e, block.id);
                    }}
                    onDoubleClick={(e) => {
                      if (!isTextLayer) return;
                      e.stopPropagation();
                      selectOnly(block.id);
                      setEditingTextId(block.id);
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
                        backgroundColor: isTextLayer
                          ? (block.backgroundColor && block.backgroundColor !== 'transparent' ? block.backgroundColor : 'transparent')
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
                              {isEditingText ? (
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
                            <EditableTextBlock block={block} isSelected={isSelected} isEditing={isEditingText} updateBlock={updateBlock} />
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
        {pendingLayoutPreview && (
          <div className="fixed left-[324px] right-[284px] bottom-5 z-[80] border border-swiss-black/10 bg-white/90 backdrop-blur shadow-xl p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-widest text-swiss-red">
                  {language === 'zh' ? '模板骨架待确认' : 'Template Preview Ready'}
                </p>
                <p className="mt-1 truncate text-[10px] leading-snug text-swiss-black/55">
                  {language === 'zh'
                    ? '请先检查槽位逻辑。确认后 AI 才会分配图片和文字生成最终排版。'
                    : 'Review the slot logic first. AI will assign images and text only after confirmation.'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => {
                    setPendingLayoutPreview(null);
                    setLastRenderJSON(null);
                  }}
                  className="h-9 px-3 border border-swiss-black/10 bg-white text-[9px] font-black uppercase tracking-widest text-swiss-black/45 hover:border-swiss-red hover:text-swiss-red transition-colors"
                >
                  {language === 'zh' ? '继续调整' : 'Keep Editing'}
                </button>
                <button
                  onClick={() => callGeminiLayout(pendingLayoutPreview.prompt, true)}
                  disabled={aiLoading}
                  className="h-9 px-4 bg-swiss-red text-white text-[9px] font-black uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:bg-swiss-red/85 transition-colors"
                >
                  {aiLoading
                    ? (language === 'zh' ? '生成中...' : 'Generating...')
                    : (language === 'zh' ? '确认并完成排版' : 'Confirm Final Layout')}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Sidebar Right: Inspector */}
      <aside className="fixed right-0 top-[52px] bottom-0 w-[260px] glass-panel z-40 p-6 flex flex-col overflow-hidden">
        <div className="mb-6">
          <h2 className="section-label">{t.inspector}</h2>
          {selectedBlock ? (
            <div className="flex items-center gap-2 py-2">
              <div className="w-2 h-2 bg-swiss-red" />
              <span className="text-[11px] font-black uppercase text-swiss-black tracking-tight">{selectedBlock.label}</span>
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
                    max={COLUMNS - selectedBlock.w + 1}
                    value={selectedBlock.x + 1} 
                    onChange={(v) => {
                      const newX = v - 1;
                      const maxW = COLUMNS - newX;
                      const newW = Math.min(selectedBlock.w, maxW);
                      updateBlock(selectedBlock.id, { x: newX, w: newW }, true);
                      setBlocks(prev => settleBlocks(prev));
                    }}
                  />
                  <PrecisionSlider 
                    label="GRID_Y (ROW)" 
                    min={1}
                    max={ROWS - selectedBlock.h + 1}
                    value={selectedBlock.y + 1} 
                    onChange={(v) => {
                      const newY = v - 1;
                      const maxH = ROWS - newY;
                      const newH = Math.min(selectedBlock.h, maxH);
                      updateBlock(selectedBlock.id, { y: newY, h: newH }, true);
                      setBlocks(prev => settleBlocks(prev));
                    }}
                  />
                  <PrecisionSlider 
                    label="SPAN_W (WIDTH)" 
                    min={1}
                    max={COLUMNS - selectedBlock.x}
                    value={selectedBlock.w} 
                    onChange={(v) => {
                      updateBlock(selectedBlock.id, { w: v }, true);
                      setBlocks(prev => settleBlocks(prev));
                    }}
                  />
                  <PrecisionSlider 
                    label="SPAN_H (HEIGHT)" 
                    min={1}
                    max={ROWS - selectedBlock.y}
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
            <div className="flex flex-col items-center justify-center h-full opacity-10 space-y-2 grayscale">
              <Box size={48} strokeWidth={1} />
              <span className="text-[10px] font-mono font-bold">NULL.DATA</span>
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
                  <p className="mt-2 text-[12px] leading-relaxed text-swiss-black/55">从左侧选择页面类型、上传素材并输入提示词；中间查看 AI 生成页面；右侧对每个元素进行精细调整。</p>
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
                  { icon: <Zap size={18} />, title: '生成', body: '第一次不需要写提示词，直接生成；生成后可用 AI Prompt 继续整理版面。' },
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

function EditableTextBlock({ block, isSelected, isEditing, updateBlock }: { block: LayoutBlock, isSelected: boolean, isEditing: boolean, updateBlock: (id: string, updates: Partial<LayoutBlock>, remember?: boolean) => void }) {
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

  if (!isEditing) {
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
        title={isSelected ? 'Double click to edit. Hold briefly, then drag to move.' : undefined}
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
  label,
  size,
  metrics
}: {
  showGrid: boolean;
  label: string;
  size: { width: number; height: number };
  metrics: ReturnType<typeof getGridMetrics>;
}) {
  if (!showGrid) return null;
  return (
    <div className="absolute inset-0 pointer-events-none select-none">
      <div className="absolute inset-0 border border-transparent opacity-0" style={{ margin: MARGIN - 1 }} />
      <div 
        className="absolute inset-0 grid"
        style={{ 
          padding: MARGIN,
          gap: GUTTER,
          gridTemplateColumns: `repeat(${COLUMNS}, ${metrics.colWidth}px)`,
          gridTemplateRows: `repeat(${ROWS}, ${metrics.rowHeight}px)`
        }}
      >
        {[...Array(COLUMNS * ROWS)].map((_, i) => (
          <div key={i} className="w-full h-full relative group">
            <div className="absolute inset-[1px] border border-transparent bg-swiss-red/[0.025]" />
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-transparent" />
          </div>
        ))}
      </div>
      <div className="absolute top-4 left-4 font-mono text-[8px] text-swiss-red/40 flex gap-4 uppercase font-bold">
        <span>Canvas: {label}</span>
        <span>Resolution: {size.width}x{size.height}</span>
      </div>
      <div className="absolute bottom-4 left-4 font-mono text-[8px] text-swiss-red/40 flex gap-4 uppercase font-bold">
        <span>Modular: {COLUMNS}x{ROWS}</span>
        <span>Gutter: {GUTTER}PX</span>
        <span>Margin: {MARGIN}PX</span>
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
