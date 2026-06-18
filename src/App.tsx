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
  Target,
  Upload,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Fullscreen,
  Scaling,
  Undo2,
  Link,
  MousePointer2,
  HelpCircle,
  X,
  Bold,
  Italic
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LayoutBlock, GridSettings } from './types';

// Constants
const COLUMNS = 12;
const ROWS = 8; 
const MARGIN = 48;
const GUTTER = 12;

type CanvasPresetId = 'digital-16-9' | 'strip-1800-768' | 'a3' | 'a4';
type CanvasOrientation = 'landscape' | 'portrait';
type LayoutMode = 'strict' | 'editorial';
type ImageAssetRole = 'hero' | 'support' | 'texture' | 'reference';
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

const TEXT_BLOCK_TYPES: LayoutBlock['type'][] = ['text', 'heading', 'title'];
const isTextBlock = (type: LayoutBlock['type']) => TEXT_BLOCK_TYPES.includes(type);
const createLocalId = () => Math.random().toString(36).slice(2, 10);

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
  const [history, setHistory] = useState<LayoutBlock[][]>([]);
  const blocksRef = useRef<LayoutBlock[]>(INITIAL_BLOCKS);
  const [showGrid, setShowGrid] = useState(true);
  const [zoom, setZoom] = useState(0.85);
  const [isLocked, setIsLocked] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('strict');
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

  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

  const rememberBlocks = () => {
    const snapshot = blocksRef.current.map(block => ({ ...block }));
    setHistory(prev => [...prev.slice(-29), snapshot]);
  };

  const undo = () => {
    setHistory(prev => {
      const previous = prev[prev.length - 1];
      if (!previous) return prev;
      setBlocks(previous);
      setSelectedId(null);
      setSelectedIds([]);
      return prev.slice(0, -1);
    });
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
        const totalTextHeight = lines.length * lineHeight;
        
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

        lines.forEach((line, i) => {
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

  const handleImageAssetUpload = (files: FileList | File[]) => {
    const nextFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    nextFiles.slice(0, Math.max(0, 10 - imageAssets.length)).forEach(file => {
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
              role: prev.length === 0 ? 'hero' : 'support',
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

  const callGeminiLayout = async (userMessage: string) => {
    setAiLoading(true);
    setChatMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setChatInput('');

    try {
      const imageManifest = imageAssets.map(asset => ({
        id: asset.id,
        name: asset.name,
        role: asset.role,
        size: asset.width && asset.height ? `${asset.width}x${asset.height}` : 'unknown'
      }));
      const textManifest = textAssets.map(asset => ({
        id: asset.id,
        role: asset.role,
        content: asset.content
      }));

      const systemPrompt = `你是一个专业的 Swiss Design 排版系统。
你的任务是根据用户的描述、图片素材池和文本素材池，生成一个适合的网格排版布局。

网格系统规格：
- 当前画布：${canvasViewportLabel}，${canvasSize.width}px × ${canvasSize.height}px
- 画布网格：12列 × 8行
- 当前每列宽：${gridMetrics.colWidth.toFixed(2)}px，每行高：${gridMetrics.rowHeight.toFixed(2)}px，间距：12px
- 坐标从 (0,0) 开始，x 最大 11，y 最大 7

图片素材池：
${JSON.stringify(imageManifest, null, 2)}

文本素材池：
${JSON.stringify(textManifest, null, 2)}

你必须只输出一个合法的 JSON 对象，不要有任何其他文字、解释或 markdown 代码块。
格式如下：
{
  "blocks": [
    { "type": "title", "label": "标题文字", "assetId": "文本素材id，可选", "x": 0, "y": 0, "w": 8, "h": 1, "category": "Generic" },
    { "type": "image", "label": "IMAGE", "assetId": "图片素材id，可选", "x": 0, "y": 1, "w": 6, "h": 5, "category": "Generic" },
    {
      "type": "text",
      "label": "描述文字",
      "assetId": "文本素材id，可选",
      "x": 6,
      "y": 1,
      "w": 6,
      "h": 3,
      "category": "Generic",
      "zIndex": 3,
      "overflowMode": "visible",
      "backgroundColor": "transparent",
      "padding": 8
    }
  ],
  "reasoning": "简短说明排版思路（中文）"
}

type 只能是: container | text | heading | image | title
category 只能是: Generic | Define | Ideation | Prototype | Final
overflowMode 只能是: clip | visible | autoHeight
如果要使用素材池里的图片或文字，必须在 block 中写入对应的 assetId。
图片 block 优先使用图片素材池；title/heading/text 优先使用文本素材池。
当需要杂志式图文叠压时，可以让文字 block 与图片 block 重叠，并提高文字的 zIndex。
确保所有 block 不超出边界：x + w <= 12，y + h <= 8
`;

      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          { text: userMessage }
        ],
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.4,
          responseMimeType: 'application/json'
        }
      });

      const rawText = response.text || '{}';
      const parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim());

      if (parsed.blocks && Array.isArray(parsed.blocks)) {
        const newBlocks: LayoutBlock[] = parsed.blocks.map((b: any, index: number) => {
          const blockType = b.type || 'container';
          const imageAsset = imageAssets.find(asset => asset.id === b.assetId);
          const textAsset = textAssets.find(asset => asset.id === b.assetId);
          const isGeneratedText = isTextBlock(blockType);
          const resolvedLabel = textAsset?.content || b.label || (blockType === 'image' ? 'IMAGE' : 'BLOCK');

          return {
            id: createLocalId(),
            type: blockType,
            label: isGeneratedText ? resolvedLabel : resolvedLabel.toUpperCase(),
            x: Math.max(0, Math.min(11, b.x || 0)),
            y: Math.max(0, Math.min(7, b.y || 0)),
            w: Math.max(1, Math.min(12, b.w || 2)),
            h: Math.max(1, Math.min(8, b.h || 2)),
            category: b.category || 'Generic',
            assetId: b.assetId,
            imageUrl: blockType === 'image' ? imageAsset?.dataUrl : undefined,
            imageFit: 'cover',
            imageZoom: 1,
            imagePanX: 0,
            imagePanY: 0,
            fontSize: isGeneratedText ? (blockType === 'title' ? 28 : blockType === 'heading' ? 18 : 12) : undefined,
            fontFamily: 'Inter, sans-serif',
            fontWeight: blockType === 'title' || blockType === 'heading' ? 'bold' : 'normal',
            fontStyle: 'normal',
            textColor: blockType === 'image' ? undefined : '#111111',
            backgroundColor: b.backgroundColor || 'transparent',
            overflowMode: b.overflowMode || (isGeneratedText ? 'visible' : 'clip'),
            padding: typeof b.padding === 'number' ? b.padding : 8,
            zIndex: typeof b.zIndex === 'number' ? b.zIndex : index + 1,
            generatedByAI: true
          };
        });

        rememberBlocks();
        setBlocks(settleBlocks(newBlocks));
        selectOnly(null);
        setChatMessages(prev => [...prev, {
          role: 'ai',
          text: parsed.reasoning || '排版已生成，可在画布上查看并继续调整。'
        }]);
      }
    } catch (err: any) {
      setChatMessages(prev => [...prev, { role: 'ai', text: `生成失败: ${err.message}` }]);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-swiss-grey-base text-swiss-black overflow-hidden select-none">
      {/* Top Bar */}
      <nav className="fixed top-0 left-0 right-0 h-[52px] bg-[#111] border-b border-[#333] text-white flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <span className="font-black text-base tracking-widest uppercase">Grid.sys</span>
            <span className="bg-swiss-red text-white px-1.5 py-0.5 rounded-[2px] text-[10px] font-bold">V2.4</span>
          </div>
          
          <div className="flex items-center gap-8 text-[11px] font-bold uppercase tracking-wider text-white/70">
            <button
              onClick={undo}
              disabled={history.length === 0}
              className="flex items-center gap-1 hover:text-swiss-red disabled:opacity-25 disabled:hover:text-white/70 transition-colors"
              title="撤回上一步"
            >
              <Undo2 size={13} strokeWidth={3} />
              UNDO
            </button>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => handleZoom(-0.05)}
                className="hover:text-swiss-red transition-colors"
              >
                <Minus size={12} strokeWidth={4} />
              </button>
              <span className="font-mono tabular-nums min-w-[32px]">
                {Math.round(zoom * 100)}% SCALE
              </span>
              <button 
                onClick={() => handleZoom(0.05)}
                className="hover:text-swiss-red transition-colors"
              >
                <Plus size={12} strokeWidth={4} />
              </button>
              <button
                onClick={fitCanvasToViewport}
                className="px-2 py-1 border border-white/15 text-white/60 hover:text-white hover:border-swiss-red transition-colors"
                title="Fit canvas to screen"
              >
                FIT
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span>VIEWPORT: {canvasViewportLabel}</span>
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
                    title={option.value === 'landscape' ? '横放' : '竖放'}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-8 text-[11px] font-bold uppercase tracking-wider text-white/50">
          <div className="flex items-center gap-2">
            <span>Layout</span>
            <div className="flex border border-white/15 bg-white/5">
              {[
                { value: 'strict' as const, label: 'STRICT' },
                { value: 'editorial' as const, label: 'FREE' },
              ].map(option => (
                <button
                  key={option.value}
                  onClick={() => setLayoutMode(option.value)}
                  className={`px-2.5 py-1 text-[10px] font-black font-mono transition-colors ${
                    layoutMode === option.value
                      ? 'bg-swiss-red text-white'
                      : 'text-white/55 hover:text-white hover:bg-white/10'
                  }`}
                  title={option.value === 'strict' ? 'Strict Grid: 自动避让' : 'Editorial Freeform: 允许叠放'}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span>Grid Visibility</span>
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
            title="新手导航"
          >
            <HelpCircle size={14} />
            GUIDE
          </button>
          
          <div className="hidden lg:block text-[10px] opacity-60">
            UNSAVED CHANGES • FILE: HCI_PORTFOLIO_DRAFT
          </div>
        </div>
      </nav>

      {/* Sidebar Left: Library */}
      <aside className="fixed left-0 top-[52px] bottom-0 w-[300px] glass-panel z-40 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-swiss-black/5 bg-white/50">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[11px] font-extrabold uppercase tracking-widest text-swiss-black/40">Components</h2>
            <Search size={14} className="opacity-30" />
          </div>
          <div className="flex gap-2">
            <div className="h-6 px-2 bg-swiss-black text-white text-[10px] flex items-center font-bold uppercase tracking-tighter">HCI.V1</div>
            <div className="h-6 px-2 border border-swiss-black text-[10px] flex items-center font-bold uppercase tracking-tighter">LAYOUT</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 scrollbar-hide space-y-6">
          <CategorySection 
            title="Basic Blocks" 
            icon={<Box size={14} />} 
            items={['Text Block', 'Image Block', 'Blank Block']} 
            onAdd={(item) => addBlock(item, 'Generic', item === 'Image Block' ? 'image' : item === 'Text Block' ? 'text' : 'blank')}
          />

          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-swiss-black/60">
                <ImageIcon size={13} />
                Image Assets
              </div>
              <span className="font-mono text-[9px] text-swiss-black/35">{imageAssets.length}/10</span>
            </div>
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
              Upload Images
            </button>
            <div className="grid grid-cols-3 gap-2 mt-3">
              {imageAssets.map(asset => (
                <div key={asset.id} className="relative group bg-white border border-swiss-black/10">
                  <img src={asset.dataUrl} alt={asset.name} className="aspect-square w-full object-cover" />
                  <button
                    onClick={() => setImageAssets(prev => prev.filter(item => item.id !== asset.id))}
                    className="absolute top-1 right-1 w-5 h-5 bg-swiss-red text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    title="Remove image"
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
                    <option value="hero">hero</option>
                    <option value="support">support</option>
                    <option value="texture">texture</option>
                    <option value="reference">ref</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3 text-[10px] font-black uppercase tracking-widest text-swiss-black/60">
              <Type size={13} />
              Text Assets
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
              placeholder="粘贴标题、正文、说明文字..."
              className="w-full h-20 resize-none bg-white/70 border border-swiss-black/10 p-2 text-[11px] leading-snug outline-none focus:border-swiss-red placeholder:text-swiss-black/25"
            />
            <button
              onClick={addTextAsset}
              disabled={!newTextAsset.trim()}
              className="mt-2 w-full h-8 bg-swiss-black text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:bg-swiss-red transition-colors"
            >
              Add Text
            </button>
            <div className="mt-3 space-y-2">
              {textAssets.map(asset => (
                <div key={asset.id} className="group border border-swiss-black/10 bg-white/60 p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[8px] font-black uppercase tracking-widest text-swiss-red">{asset.role}</span>
                    <button
                      onClick={() => setTextAssets(prev => prev.filter(item => item.id !== asset.id))}
                      className="text-swiss-black/25 hover:text-swiss-red"
                      title="Remove text"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <p className="text-[10px] leading-snug text-swiss-black/70 line-clamp-3 whitespace-pre-wrap">{asset.content}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-swiss-black/60">
                <Zap size={13} />
                AI Insert
              </div>
              {aiLoading && <span className="text-[8px] font-mono font-bold text-swiss-red animate-pulse">GENERATING</span>}
            </div>
            <textarea
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && chatInput.trim() && !aiLoading) {
                  callGeminiLayout(chatInput.trim());
                }
              }}
              placeholder="描述想要的排版，例如：主图占左侧，标题压在图片右上，正文放下方..."
              className="w-full h-24 resize-none bg-[#111] border border-[#333] text-white p-3 text-[11px] leading-snug outline-none focus:border-swiss-red placeholder:text-white/25"
            />
            <button
              onClick={() => chatInput.trim() && !aiLoading && callGeminiLayout(chatInput.trim())}
              disabled={aiLoading || !chatInput.trim()}
              className="mt-2 w-full h-9 bg-swiss-red text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:bg-swiss-red/85 transition-colors"
            >
              Generate Layout
            </button>
            <div className="mt-3 space-y-2">
              {chatMessages.slice(-3).map((msg, index) => (
                <div
                  key={`${msg.role}-${index}-${msg.text.slice(0, 12)}`}
                  className={`p-2 text-[10px] leading-snug border ${
                    msg.role === 'user'
                      ? 'bg-white/60 border-swiss-black/10 text-swiss-black/55'
                      : 'bg-swiss-red/10 border-swiss-red/20 text-swiss-black/75'
                  }`}
                >
                  <span className="block mb-1 text-[8px] font-black uppercase tracking-widest text-swiss-black/35">
                    {msg.role === 'user' ? 'Prompt' : 'AI'}
                  </span>
                  {msg.text}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-swiss-black/5 bg-swiss-grey-light/30">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-swiss-red flex items-center justify-center text-white font-black text-xs">A</div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase leading-none">System User</span>
              <span className="text-[9px] font-mono opacity-50 uppercase">Grid Author</span>
            </div>
          </div>
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
                      e.stopPropagation();
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
                                  className={`w-full bg-transparent border-none resize-none outline-none text-left leading-tight tracking-tighter uppercase placeholder:text-current placeholder:opacity-20 scrollbar-hide drag-handle cursor-move ${
                                    blockOverflowMode === 'autoHeight' ? 'min-h-[44px] overflow-visible' : 'h-full'
                                  }`}
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
        <div className="mb-6 pb-5 border-b border-swiss-black/10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-label !mb-0">Canvas Size</h2>
            <span className="font-mono text-[9px] font-bold text-swiss-red">
              {canvasSize.width}x{canvasSize.height}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {CANVAS_PRESETS.map(preset => (
              <button
                key={preset.id}
                onClick={() => selectCanvasPreset(preset)}
                className={`px-2 py-2 border text-[10px] font-black font-mono uppercase transition-all ${
                  canvasPresetId === preset.id
                    ? 'bg-swiss-red text-white border-swiss-red'
                    : 'bg-white text-swiss-black border-swiss-black/10 hover:border-swiss-red hover:text-swiss-red'
                }`}
                title={`${preset.viewportLabel} ${preset.width}x${preset.height}px`}
              >
                <span className="block">{preset.label}</span>
                <span className={`block mt-1 text-[8px] font-medium ${
                  canvasPresetId === preset.id ? 'text-white/70' : 'text-swiss-black/35'
                }`}>
                  {preset.width}x{preset.height}
                </span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1 mt-2">
            {[
              { value: 'landscape' as const, label: '横放', icon: 'H' },
              { value: 'portrait' as const, label: '竖放', icon: 'V' },
            ].map(option => (
              <button
                key={option.value}
                onClick={() => setCanvasOrientation(option.value)}
                className={`px-2 py-2 border text-[10px] font-black uppercase transition-all ${
                  canvasOrientation === option.value
                    ? 'bg-swiss-black text-white border-swiss-black'
                    : 'bg-white text-swiss-black border-swiss-black/10 hover:border-swiss-red hover:text-swiss-red'
                }`}
              >
                <span className="font-mono mr-1">{option.icon}</span>
                {option.label}
              </button>
            ))}
          </div>
          <button
            onClick={fitCanvasToViewport}
            className="mt-2 w-full py-2 bg-white border border-swiss-black/10 text-[10px] font-black font-mono uppercase tracking-widest hover:bg-swiss-red hover:text-white hover:border-swiss-red transition-all"
          >
            Fit To View
          </button>
        </div>

        <div className="mb-6">
          <h2 className="section-label">Parametric Inspector</h2>
          {selectedBlock ? (
            <div className="flex items-center gap-2 py-2">
              <div className="w-2 h-2 bg-swiss-red" />
              <span className="text-[11px] font-black uppercase text-swiss-black tracking-tight">{selectedBlock.label}</span>
            </div>
          ) : selectedIds.length > 1 ? (
            <div className="py-2 border-b border-black/5">
              <span className="text-[10px] font-bold text-swiss-grey-dark uppercase tracking-widest">{selectedIds.length} BLOCKS SELECTED</span>
              <p className="mt-2 text-[10px] leading-relaxed text-swiss-black/45">拖动任一已选区块即可整体移动。按住 Shift 或 Command 点击区块可增减选择。</p>
            </div>
          ) : (
            <div className="py-2 border-b border-black/5">
              <span className="text-[10px] font-bold text-swiss-grey-dark uppercase tracking-widest">Select Element</span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide space-y-6">
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
                  <span className="text-[9px] font-bold uppercase tracking-widest opacity-40">LAYER ORDER</span>
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
                  <span className="text-[9px] font-bold uppercase tracking-widest opacity-40">IMAGE TRANSFORM</span>

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
                    <span className="text-[9px] font-mono uppercase opacity-40 block mb-1">TEXT LAYER</span>
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
                    <span className="text-[9px] font-mono uppercase opacity-40 block mb-1">BACKGROUND</span>
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
                    label="Padding [PX]"
                    min={0}
                    max={48}
                    value={selectedBlock.padding ?? 8}
                    onChange={(v) => updateBlock(selectedBlock.id, { padding: v })}
                  />

                  {/* 字体选择 */}
                  <div>
                    <span className="text-[9px] font-mono uppercase opacity-40 block mb-1">TYPEFACE</span>
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
                    <span className="text-[9px] font-mono uppercase opacity-40 block mb-1">WEIGHT</span>
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
                    <span className="text-[9px] font-mono uppercase opacity-40 block mb-1">STYLE</span>
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
                    <span className="text-[9px] font-mono uppercase opacity-40 block mb-1">COLOR</span>
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
                      <span className="text-[9px] font-mono uppercase opacity-40">SIZE</span>
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
                    <span className="text-[9px] font-mono uppercase opacity-40 block mb-1">ALIGNMENT</span>
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

              <div className="space-y-3 pt-4 border-t border-black/5">
                <h3 className="section-label">Content / Metadata</h3>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#666]">Block Label</span>
                  <input 
                    type="text" 
                    value={selectedBlock.label} 
                    onChange={(e) => updateBlock(selectedBlock.id, { label: e.target.value })}
                    onFocus={rememberBlocks}
                    className="w-full mt-1 p-2 bg-white border border-black/10 text-[11px] font-bold uppercase tracking-tight focus:border-swiss-red outline-none transition-colors"
                  />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#666]">Hyperlink</span>
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

              <div className="space-y-4 pt-4 border-t border-black/5">
                <h3 className="section-label">Typography / Kern</h3>
                <div className="space-y-1">
                  {(selectedBlock.type === 'text' || selectedBlock.type === 'heading') && (
                    <PrecisionSlider 
                      label="Font_Size [PT]" 
                      min={6}
                      max={120}
                      value={selectedBlock.fontSize || 12} 
                      onChange={(v) => updateBlock(selectedBlock.id, { fontSize: v })}
                    />
                  )}
                  <div>
                    <span className="text-[10px] uppercase font-bold text-[#666]">Tracking</span>
                    <div className="control-dial">
                      <div className="control-knob left-[40%]" />
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-[#666]">Leading</span>
                    <div className="control-dial">
                      <div className="control-knob left-[70%]" />
                    </div>
                  </div>
                </div>
              </div>

              {selectedBlock.imageUrl && (
                <div className="space-y-4 pt-4 border-t border-black/5">
                  <h3 className="section-label">Image Transformation</h3>
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
                    Replace Image
                  </button>
                  <div className="space-y-2">
                    <div className="inspector-row !border-none">
                      <span className="text-[10px] uppercase font-bold text-[#666]">Fit Mode</span>
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

              <div className="pt-6 space-y-3">
                <button 
                  onClick={exportSVG}
                  className="w-full py-3 bg-white text-swiss-black text-[11px] font-bold uppercase tracking-widest hover:bg-swiss-red hover:text-white transition-all border border-swiss-black/10 hover:border-swiss-red"
                >
                  Export SVG
                </button>
                <button 
                  onClick={() => alert('SPEC EXPORT SEQUENCE INITIATED... [MOCK]')}
                  className="w-full py-3 bg-[#111] text-white text-[11px] font-bold uppercase tracking-widest hover:bg-swiss-black transition-all border border-transparent hover:border-white/20"
                >
                  Export PDF Spec
                </button>
                <button 
                  onClick={() => {
                    rememberBlocks();
                    setBlocks(prev => settleBlocks(prev.filter(b => !selectedIds.includes(b.id))));
                    selectOnly(null);
                  }}
                  className="w-full py-2 bg-transparent text-swiss-black/40 text-[9px] font-mono font-bold uppercase tracking-[0.2em] hover:bg-swiss-red/5 hover:text-swiss-red transition-all border border-swiss-black/5 hover:border-swiss-red/20"
                >
                  DELETE
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full opacity-10 space-y-2 grayscale">
              <Box size={48} strokeWidth={1} />
              <span className="text-[10px] font-mono font-bold">NULL.DATA</span>
            </div>
          )}
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
                  <p className="mt-2 text-[12px] leading-relaxed text-swiss-black/55">从左侧添加文字、图片或空白块；在画布上拖动排版；右侧编辑尺寸、文字样式和链接。</p>
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
                  { icon: <Plus size={18} />, title: '添加', body: '左侧只保留文字、图片、空白三类基础块。' },
                  { icon: <MousePointer2 size={18} />, title: '多选', body: 'Shift 或 Command 点击多个块，再拖动整体移动。' },
                  { icon: <Undo2 size={18} />, title: '撤回', body: '顶部 Undo 或 Command/Ctrl + Z 回退上一步。' },
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
          overflowMode === 'visible' ? 'overflow-visible' : 'overflow-hidden'
        } ${overflowMode === 'autoHeight' ? 'min-h-full h-auto' : 'h-full'}`}
        style={{ ...textStyle, padding: block.padding ?? 8 }}
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
      <div className="absolute inset-0 border border-swiss-red/20 opacity-50" style={{ margin: MARGIN - 1 }} />
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
            <div className="absolute inset-0 border border-swiss-red/10 bg-swiss-red/[0.02]" />
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-swiss-red/5" />
            <div className="absolute bottom-1 right-1">
               <span className="text-[6px] font-mono text-swiss-red/20">{Math.floor(i / COLUMNS) + 1}</span>
            </div>
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
      <div className="absolute top-0 left-0 w-8 h-8 border-t border-l border-swiss-red/30" />
      <div className="absolute top-0 right-0 w-8 h-8 border-t border-r border-swiss-red/30" />
      <div className="absolute bottom-0 left-0 w-8 h-8 border-b border-l border-swiss-red/30" />
      <div className="absolute bottom-0 right-0 w-8 h-8 border-b border-r border-swiss-red/30" />
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
