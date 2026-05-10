/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
'use client';
import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Scaling
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutBlock, GridSettings } from '../types';

// Constants
const COLUMNS = 12;
const ROWS = 8; 
const FRAME_WIDTH = 960;
const FRAME_HEIGHT = 540; 
const MARGIN = 48;
const GUTTER = 12;

// The core architectural fix: Precise, isolated Safe Area dimensions
const SAFE_AREA_WIDTH = FRAME_WIDTH - (MARGIN * 2);  // 864
const SAFE_AREA_HEIGHT = FRAME_HEIGHT - (MARGIN * 2); // 444

// Precise mathematical dimension calculation for perfect alignment
const COL_WIDTH = (SAFE_AREA_WIDTH - (COLUMNS - 1) * GUTTER) / COLUMNS; // 60
const ROW_HEIGHT = (SAFE_AREA_HEIGHT - (ROWS - 1) * GUTTER) / ROWS;     // 45
const COL_UNIT = COL_WIDTH + GUTTER; // 72
const ROW_UNIT = ROW_HEIGHT + GUTTER; // 57

// Helper to get pixel position and size
const getPixelRect = (x: number, y: number, w: number, h: number) => ({
  left: x * COL_UNIT,
  top: y * ROW_UNIT,
  width: w * COL_WIDTH + (w - 1) * GUTTER,
  height: h * ROW_HEIGHT + (h - 1) * GUTTER
});

const INITIAL_BLOCKS: LayoutBlock[] = [
  { 
    id: '1', 
    type: 'heading', 
    label: 'PROBLEM STATEMENT', 
    x: 0, 
    y: 0, 
    w: 4, 
    h: 3, 
    category: 'Define' 
  },
  { 
    id: '2', 
    type: 'container', 
    label: 'ITERATION CYCLE 01', 
    x: 4, 
    y: 0, 
    w: 2, 
    h: 2, 
    category: 'Prototype' 
  },
];

export default function App() {
  const [blocks, setBlocks] = useState<LayoutBlock[]>(INITIAL_BLOCKS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [zoom, setZoom] = useState(0.85);
  const [isLocked, setIsLocked] = useState(false);
  
  // AI Panel 显示状态
  const [showAIPanel, setShowAIPanel] = useState(false);
  // Moodboard 图片列表（base64）
  const [moodImages, setMoodImages] = useState<string[]>([]);
  // Chat 消息记录
  const [chatMessages, setChatMessages] = useState<{role:'user'|'ai', text:string}[]>([]);
  // Chat 输入框内容
  const [chatInput, setChatInput] = useState('');
  // AI 加载状态
  const [aiLoading, setAiLoading] = useState(false);
  
  // Drag State
  const [dragPreview, setDragPreview] = useState<{ id: string, x: number, y: number } | null>(null);
  const dragRef = useRef<{ id: string, startMouseX: number, startMouseY: number, startBlockX: number, startBlockY: number } | null>(null);
  const resizeRef = useRef<{
    id: string
    startMouseX: number
    startMouseY: number
    startW: number
    startH: number
  } | null>(null);
  const [isResizing, setIsResizing] = useState(false);

  // Selected block data
  const selectedBlock = useMemo(() => 
    blocks.find(b => b.id === selectedId), 
    [blocks, selectedId]
  );

  const updateBlock = (id: string, updates: Partial<LayoutBlock>) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  };

  const addBlock = (name: string, category: LayoutBlock['category'], type: LayoutBlock['type'] = 'container') => {
    const newBlock: LayoutBlock = {
      id: Math.random().toString(36).substr(2, 9),
      type: type,
      label: name.toUpperCase(),
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      category: category,
      imageFit: 'cover',
      imageZoom: 1,
      imagePanX: 0,
      imagePanY: 0,
      fontSize: type === 'text' || type === 'heading' ? 12 : undefined
    };
    
    // Auto-compact after adding
    const newBlocksSorted = applyCompact([...blocks, newBlock]);
    setBlocks(newBlocksSorted);
    setSelectedId(newBlock.id);
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

  // DRAG DRAG ENGINE
  const handleDragStart = (e: React.MouseEvent, id: string) => {
    if (isLocked) return;
    const block = blocks.find(b => b.id === id);
    if (!block) return;

    dragRef.current = {
      id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startBlockX: block.x,
      startBlockY: block.y
    };

    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
  };

  const handleDragMove = (e: MouseEvent) => {
    if (!dragRef.current) return;
    const { id, startMouseX, startMouseY, startBlockX, startBlockY } = dragRef.current;
    
    const block = blocks.find(b => b.id === id);
    if (!block) return;

    const dx = Math.round((e.clientX - startMouseX) / zoom / COL_UNIT);
    const dy = Math.round((e.clientY - startMouseY) / zoom / ROW_UNIT);

    const newX = Math.max(0, Math.min(COLUMNS - block.w, startBlockX + dx));
    const newY = Math.max(0, Math.min(ROWS - block.h, startBlockY + dy));

    // Update real-time if grid position changed
    if (newX !== block.x || newY !== block.y || !dragPreview) {
      setDragPreview({ id, x: newX, y: newY });
      
      const movedBlocks = blocks.map(b => 
        b.id === id ? { ...b, x: newX, y: newY } : b
      );
      setBlocks(applyCompact(movedBlocks, id));
    }
  };

  const handleDragEnd = () => {
    dragRef.current = null;
    setDragPreview(null);
    window.removeEventListener('mousemove', handleDragMove);
    window.removeEventListener('mouseup', handleDragEnd);
  };

  const handleResizeStart = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // 防止触发拖拽移动
    e.preventDefault();
    if (isLocked) return;
    const block = blocks.find(b => b.id === id);
    if (!block) return;

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

    const dw = Math.round((e.clientX - startMouseX) / zoom / COL_UNIT);
    const dh = Math.round((e.clientY - startMouseY) / zoom / ROW_UNIT);

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
    setBlocks(prev => applyCompact(prev));
    window.removeEventListener('mousemove', handleResizeMove);
    window.removeEventListener('mouseup', handleResizeEnd);
  };

  const handleFileUpload = (blockId: string, file: File) => {
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

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && !isLocked) {
        setBlocks(prev => applyCompact(prev.filter(b => b.id !== selectedId)));
        setSelectedId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, isLocked]);

  const exportSVG = () => {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', String(FRAME_WIDTH));
    svg.setAttribute('height', String(FRAME_HEIGHT));
    svg.setAttribute('viewBox', `0 0 ${FRAME_WIDTH} ${FRAME_HEIGHT}`);
    svg.setAttribute('xmlns', svgNS);
    const bg = document.createElementNS(svgNS, 'rect');
    bg.setAttribute('width', String(FRAME_WIDTH));
    bg.setAttribute('height', String(FRAME_HEIGHT));
    bg.setAttribute('fill', '#ffffff');
    svg.appendChild(bg);
    blocks.forEach(block => {
      const x = MARGIN + block.x * (COL_WIDTH + GUTTER);
      const y = MARGIN + block.y * (ROW_HEIGHT + GUTTER);
      const w = block.w * COL_WIDTH + (block.w - 1) * GUTTER;
      const h = block.h * ROW_HEIGHT + (block.h - 1) * GUTTER;

      const rect = document.createElementNS(svgNS, 'rect');
      rect.setAttribute('x', String(x));
      rect.setAttribute('y', String(y));
      rect.setAttribute('width', String(w));
      rect.setAttribute('height', String(h));
      rect.setAttribute('fill', '#ffffff');
      rect.setAttribute('stroke', '#111111');
      rect.setAttribute('stroke-width', '0.5');
      svg.appendChild(rect);

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
        const textClipId = `textclip-${block.id}`;
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

        // 读取 block 的排版属性
        const fontSize = block.fontSize || 13;
        const fontFamily = block.fontFamily || 'monospace';
        const fontWeight = block.fontWeight === 'black' ? 900 
          : block.fontWeight === 'bold' ? 700 : 400;
        const textAnchor = block.textAlign === 'right' ? 'end'
          : block.textAlign === 'center' ? 'middle' : 'start';
        const textX = block.textAlign === 'right' ? x + w - 8
          : block.textAlign === 'center' ? x + w / 2
          : x + 8; // 左对齐留 8px padding

        // 处理自动换行：monospace 字体每字符约 0.62em，serif/sans 约 0.52em
        const charWidth = (block.fontFamily || 'monospace').includes('mono') 
          ? fontSize * 0.62 
          : fontSize * 0.52;
        const charsPerLine = Math.floor((w - 16) / charWidth);
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
          : y + 8 + fontSize;

        // 用 <text> + 多个 <tspan> 实现多行
        const textEl = document.createElementNS(svgNS, 'text');
        textEl.setAttribute('font-family', fontFamily);
        textEl.setAttribute('font-size', String(fontSize));
        textEl.setAttribute('font-weight', String(fontWeight));
        textEl.setAttribute('fill', '#111111');
        textEl.setAttribute('text-anchor', textAnchor);
        textEl.setAttribute('x', String(textX));
        textEl.setAttribute('y', String(startY));
        textEl.setAttribute('clip-path', `url(#${textClipId})`);

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
    a.download = 'gridsys_layout.svg'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleZoom = (delta: number) => {
    setZoom(prev => Math.min(Math.max(prev + delta, 0.4), 1.5));
  };

  const callGeminiLayout = async (userMessage: string) => {
    setAiLoading(true);
    setChatMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setChatInput('');

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, images: moodImages }),
      });
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const parsed = await response.json();

      if (parsed.blocks && Array.isArray(parsed.blocks)) {
        const newBlocks: LayoutBlock[] = parsed.blocks.map((b: any) => ({
          id: Math.random().toString(36).substr(2, 9),
          type: b.type || 'container',
          label: (b.label || 'BLOCK').toUpperCase(),
          x: Math.max(0, Math.min(11, b.x || 0)),
          y: Math.max(0, Math.min(7, b.y || 0)),
          w: Math.max(1, Math.min(12, b.w || 2)),
          h: Math.max(1, Math.min(8, b.h || 2)),
          category: b.category || 'Generic',
          imageFit: 'cover', imageZoom: 1, imagePanX: 0, imagePanY: 0,
          fontSize: b.type === 'text' || b.type === 'heading' ? 12 : undefined
        }));

        setBlocks(applyCompact(newBlocks));
        setSelectedId(null);
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
            <div className="flex items-center gap-4">
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
            </div>
            <span>VIEWPORT: 16:9_DIGITAL</span>
          </div>
        </div>

        <div className="flex items-center gap-8 text-[11px] font-bold uppercase tracking-wider text-white/50">
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
            onClick={() => setShowAIPanel(!showAIPanel)}
            className={`flex items-center gap-2 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-all border ${
              showAIPanel
                ? 'bg-swiss-red text-white border-swiss-red'
                : 'bg-transparent text-white/70 border-white/20 hover:border-swiss-red hover:text-swiss-red'
            }`}
          >
            AI STUDIO
          </button>
          
          <div className="hidden lg:block text-[10px] opacity-60">
            UNSAVED CHANGES • FILE: HCI_PORTFOLIO_DRAFT
          </div>
        </div>
      </nav>

      {/* Sidebar Left: Library */}
      <aside className="fixed left-0 top-[52px] bottom-0 w-[220px] glass-panel z-40 p-6 flex flex-col overflow-hidden">
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
            title="Generic / System" 
            icon={<Box size={14} />} 
            items={['Image Block', 'Text Block', 'Title Block', 'Container']} 
            onAdd={(item) => addBlock(item, 'Generic', item === 'Image Block' ? 'image' : item === 'Text Block' ? 'text' : item === 'Title Block' ? 'title' : 'container')}
          />
          <CategorySection 
            title="Define / Problem" 
            icon={<Target size={14} />} 
            items={['Statement', 'Goals', 'Audience', 'HMW']} 
            onAdd={(item) => addBlock(item, 'Define')}
          />
          <CategorySection 
            title="Ideation / Explore" 
            icon={<Workflow size={14} />} 
            items={['Mind Map', 'User Flow', 'Sketch Grid', 'Concept']} 
            onAdd={(item) => addBlock(item, 'Ideation')}
          />
          <CategorySection 
            title="Prototype / Iteration" 
            icon={<Zap size={14} />} 
            items={['Wireframe', 'Component', 'User Test', 'Annotated']} 
            onAdd={(item) => addBlock(item, 'Prototype')}
          />
          <CategorySection 
            title="Final Output" 
            icon={<LayoutGrid size={14} />} 
            items={['Hero Shot', 'Spec Sheet', 'Impact', 'Conclusion']} 
            onAdd={(item) => addBlock(item, 'Final')}
          />
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
        className="flex-1 flex items-center justify-center pt-[52px] pl-[220px] pr-[260px] overflow-scroll scrollbar-hide bg-swiss-grey-canvas"
        onMouseDown={() => setSelectedId(null)}
      >
        <div 
          style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
          className="transition-transform duration-300 ease-out py-20"
        >
          {/* Frame Workspace (16:9) */}
          <div 
            className="relative shadow-2xl bg-white overflow-hidden"
            style={{ width: FRAME_WIDTH, height: FRAME_HEIGHT }}
          >
            <GridView showGrid={showGrid} />
            
            {/* Isolated Safe Area Wrapper: The strict bounding box */}
            <div 
              id="grid-safe-area"
              className="absolute z-20 overflow-hidden"
              style={{ 
                top: `${MARGIN}px`, 
                left: `${MARGIN}px`, 
                width: `${SAFE_AREA_WIDTH}px`,
                height: `${SAFE_AREA_HEIGHT}px`,
                boxSizing: 'border-box'
              }}
            >
              {blocks.map(block => {
                const isDragging = dragPreview?.id === block.id;
                const rect = isDragging 
                  ? getPixelRect(dragPreview!.x, dragPreview!.y, block.w, block.h)
                  : getPixelRect(block.x, block.y, block.w, block.h);

                return (
                  <div 
                    key={block.id} 
                    style={{
                      position: 'absolute',
                      left: rect.left,
                      top: rect.top,
                      width: rect.width,
                      height: rect.height,
                      transition: isDragging ? 'none' : 'left 150ms ease, top 150ms ease, width 150ms ease, height 150ms ease'
                    }}
                    className={`relative group ${
                      selectedId === block.id 
                        ? 'z-30 selected-block shadow-2xl' 
                        : 'z-20'
                    }`}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.files?.[0]) {
                        handleFileUpload(block.id, e.dataTransfer.files[0]);
                      }
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setSelectedId(block.id);
                      handleDragStart(e, block.id);
                    }}
                  >
                    <div className={`absolute inset-0 flex flex-col border transition-all duration-300 overflow-hidden ${
                      selectedId === block.id 
                        ? 'bg-swiss-red text-white border-swiss-red shadow-xl ring-2 ring-swiss-red ring-offset-2 ring-offset-white' 
                        : 'bg-white border-swiss-black/10 text-swiss-black shadow-sm'
                    }`}>
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
                          {selectedId === block.id && <div className="absolute inset-0 bg-swiss-red/60" />}
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
                      } ${['text','heading','title'].includes(block.type) ? 'pt-1 px-2 pb-1' : (block.w === 1 || block.h === 1 ? 'p-1.5' : 'p-4')}`}>
                        {/* Drag Handle & Label */}
                        {block.type !== 'title' && (
                          <div className={`transition-opacity duration-150 ${
                            selectedId === block.id ? 'opacity-100' : 'opacity-0'
                          } flex items-center justify-between pr-4`}>
                            <div className="flex-1 flex items-center gap-2 cursor-move min-w-0">
                              <span className={`${block.w === 1 || block.h === 1 ? 'text-[6px]' : 'text-[10px]'} font-mono font-bold tracking-tight uppercase truncate ${selectedId === block.id ? 'text-white' : 'opacity-40'}`}>
                                {block.category} [{block.w}x{block.h}]
                              </span>
                              <div className={`${block.w === 1 || block.h === 1 ? 'w-1 h-1' : 'w-2 h-2'} rounded-full flex-shrink-0 ${selectedId === block.id ? 'bg-white' : 'bg-swiss-red'}`} />
                            </div>
                          </div>
                        )}
                        
                        <div className={`flex-1 flex flex-col ${['text','heading','title'].includes(block.type) ? 'items-start justify-start' : 'items-center justify-center'} overflow-hidden relative`}>
                          {block.type === 'title' ? (
                            <div className="absolute inset-0 flex items-start justify-start">
                              <textarea
                                value={block.label}
                                onChange={(e) => updateBlock(block.id, { label: e.target.value })}
                                placeholder="TITLE..."
                                style={{ 
                                  fontFamily: block.fontFamily || 'monospace',
                                  fontWeight: block.fontWeight === 'black' ? 900 : block.fontWeight === 'bold' ? 700 : 400,
                                  fontSize: `${block.fontSize || 32}px`,
                                  textAlign: block.textAlign || 'left',
                                  color: 'inherit',
                                }}
                                className="w-full h-full bg-transparent border-none resize-none outline-none text-left leading-tight tracking-tighter uppercase px-1 placeholder:text-current placeholder:opacity-20 scrollbar-hide drag-handle cursor-move"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          ) : block.type === 'text' || block.type === 'heading' ? (
                            <EditableTextBlock block={block} updateBlock={updateBlock} />
                          ) : (
                            <span className={`text-center font-black ${block.w === 1 || block.h === 1 ? 'text-[8px]' : 'text-lg'} tracking-tighter uppercase leading-tight px-1 break-words drop-shadow-sm`}>
                              {block.label}
                            </span>
                          )}
                        </div>

                        {block.type !== 'title' && (
                          <div className={`transition-opacity duration-150 ${
                            selectedId === block.id ? 'opacity-100' : 'opacity-0'
                          } flex items-center justify-between pt-1 border-t font-mono ${block.w === 1 || block.h === 1 ? 'text-[5px]' : 'text-[8px]'} uppercase tracking-widest ${selectedId === block.id ? 'border-white/30' : 'border-swiss-black/10 opacity-30 text-swiss-black'}`}>
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
                    {selectedId === block.id && !isLocked && (
                      <div
                        className="absolute bottom-0 right-0 w-3 h-3 bg-swiss-red cursor-se-resize z-50 flex items-center justify-center"
                        style={{ margin: '2px' }}
                        onMouseDown={(e) => handleResizeStart(e, block.id)}
                      >
                        {/* 小三角视觉提示 */}
                        <div className="w-1.5 h-1.5 border-r-2 border-b-2 border-white opacity-70" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* AI Layout Studio Panel */}
      {showAIPanel && (
        <div className="fixed bottom-0 left-[220px] right-[260px] h-[320px] bg-[#111] border-t border-[#333] z-50 flex flex-col">
          
          {/* Panel Header */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-[#333]">
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-bold uppercase tracking-widest text-white">AI LAYOUT STUDIO</span>
              <span className="bg-swiss-red text-white px-1.5 py-0.5 text-[9px] font-bold">GEMINI 2.0</span>
              {aiLoading && <span className="text-[9px] font-mono text-swiss-red animate-pulse">GENERATING...</span>}
            </div>
            <button onClick={() => setShowAIPanel(false)} className="text-white/40 hover:text-white text-[11px] font-mono">[ CLOSE ]</button>
          </div>

          <div className="flex flex-1 overflow-hidden">
            
            {/* Left: Moodboard */}
            <div className="w-[280px] border-r border-[#333] flex flex-col">
              <div className="px-4 py-2 border-b border-[#333]">
                <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">Moodboard — 风格参考</span>
              </div>
              <div className="flex-1 p-3 overflow-y-auto scrollbar-hide">
                <div className="grid grid-cols-3 gap-2">
                  {moodImages.map((img, i) => (
                    <div key={i} className="relative aspect-square group">
                      <img src={img} className="w-full h-full object-cover" />
                      <button
                        onClick={() => setMoodImages(prev => prev.filter((_, j) => j !== i))}
                        className="absolute top-0.5 right-0.5 w-4 h-4 bg-swiss-red text-white text-[8px] font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >✕</button>
                    </div>
                  ))}
                  {moodImages.length < 6 && (
                    <button
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/*';
                        input.multiple = true;
                        input.onchange = (e) => {
                          const files = Array.from((e.target as HTMLInputElement).files || []);
                          files.slice(0, 6 - moodImages.length).forEach(file => {
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              setMoodImages(prev => [...prev, ev.target?.result as string]);
                            };
                            reader.readAsDataURL(file);
                          });
                        };
                        input.click();
                      }}
                      className="aspect-square border border-dashed border-white/20 flex flex-col items-center justify-center gap-1 hover:border-swiss-red hover:bg-swiss-red/5 transition-all"
                    >
                      <span className="text-white/40 text-lg">+</span>
                      <span className="text-[8px] font-mono text-white/30 uppercase">Add Ref</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Chat */}
            <div className="flex-1 flex flex-col">
              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 scrollbar-hide">
                {chatMessages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full opacity-20 space-y-2">
                    <span className="text-[10px] font-mono text-white uppercase tracking-widest">描述你想要的排版风格</span>
                    <span className="text-[9px] font-mono text-white/50">例如：上传参考图，生成一个产品展示排版</span>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] px-3 py-2 text-[11px] font-mono ${
                      msg.role === 'user'
                        ? 'bg-swiss-red text-white'
                        : 'bg-[#222] text-white/80 border border-[#333]'
                    }`}>
                      {msg.role === 'ai' && <span className="text-swiss-red text-[9px] block mb-1 font-bold">AI STUDIO</span>}
                      {msg.text}
                    </div>
                  </div>
                ))}
                {aiLoading && (
                  <div className="flex justify-start">
                    <div className="bg-[#222] border border-[#333] px-3 py-2">
                      <span className="text-swiss-red text-[9px] font-mono animate-pulse">ANALYZING MOODBOARD...</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="border-t border-[#333] px-4 py-3 flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && chatInput.trim() && !aiLoading) {
                      callGeminiLayout(chatInput.trim());
                    }
                  }}
                  placeholder="描述排版风格，例如：大图左侧，文字右侧，简洁留白..."
                  className="flex-1 bg-[#222] border border-[#333] text-white text-[11px] font-mono px-3 py-2 outline-none focus:border-swiss-red placeholder:text-white/20"
                />
                <button
                  onClick={() => chatInput.trim() && !aiLoading && callGeminiLayout(chatInput.trim())}
                  disabled={aiLoading || !chatInput.trim()}
                  className="px-4 py-2 bg-swiss-red text-white text-[11px] font-bold uppercase tracking-widest hover:bg-swiss-red/80 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  GEN
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar Right: Inspector */}
      <aside className="fixed right-0 top-[52px] bottom-0 w-[260px] glass-panel z-40 p-6 flex flex-col overflow-hidden">
        <div className="mb-6">
          <h2 className="section-label">Parametric Inspector</h2>
          {selectedBlock ? (
            <div className="flex items-center gap-2 py-2">
              <div className="w-2 h-2 bg-swiss-red" />
              <span className="text-[11px] font-black uppercase text-swiss-black tracking-tight">{selectedBlock.label}</span>
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
                      updateBlock(selectedBlock.id, { x: newX, w: newW });
                      setBlocks(prev => applyCompact(prev));
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
                      updateBlock(selectedBlock.id, { y: newY, h: newH });
                      setBlocks(prev => applyCompact(prev));
                    }}
                  />
                  <PrecisionSlider 
                    label="SPAN_W (WIDTH)" 
                    min={1}
                    max={COLUMNS - selectedBlock.x}
                    value={selectedBlock.w} 
                    onChange={(v) => {
                      updateBlock(selectedBlock.id, { w: v });
                      setBlocks(prev => applyCompact(prev));
                    }}
                  />
                  <PrecisionSlider 
                    label="SPAN_H (HEIGHT)" 
                    min={1}
                    max={ROWS - selectedBlock.y}
                    value={selectedBlock.h} 
                    onChange={(v) => {
                      updateBlock(selectedBlock.id, { h: v });
                      setBlocks(prev => applyCompact(prev));
                    }}
                  />
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
                          onClick={() => updateBlock(selectedBlock.id, { imageRotation: deg as 0|90|180|270 })}
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
                        onClick={() => updateBlock(selectedBlock.id, { imageFlipX: !selectedBlock.imageFlipX })}
                        className={`py-1.5 text-[10px] font-bold font-mono border transition-all ${
                          selectedBlock.imageFlipX
                            ? 'bg-swiss-red text-white border-swiss-red'
                            : 'bg-white text-swiss-black border-swiss-black/10 hover:border-swiss-red'
                        }`}
                      >↔ HORIZONTAL</button>
                      <button
                        onClick={() => updateBlock(selectedBlock.id, { imageFlipY: !selectedBlock.imageFlipY })}
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
                          onClick={() => updateBlock(selectedBlock.id, { fontFamily: f.value })}
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
                    <div className="grid grid-cols-3 gap-1">
                      {(['normal','bold','black'] as const).map(w => (
                        <button
                          key={w}
                          onClick={() => updateBlock(selectedBlock.id, { fontWeight: w })}
                          className={`py-1.5 text-[10px] border transition-all uppercase ${
                            (selectedBlock.fontWeight || 'normal') === w
                              ? 'bg-swiss-red text-white border-swiss-red'
                              : 'bg-white text-swiss-black border-swiss-black/10 hover:border-swiss-red'
                          }`}
                          style={{ fontWeight: w === 'black' ? 900 : w }}
                        >
                          {w}
                        </button>
                      ))}
                    </div>
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
                          onClick={() => updateBlock(selectedBlock.id, { textAlign: a.value as 'left'|'center'|'right' })}
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
                    className="w-full mt-1 p-2 bg-white border border-black/10 text-[11px] font-bold uppercase tracking-tight focus:border-swiss-red outline-none transition-colors"
                  />
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
                          onClick={() => updateBlock(selectedBlock.id, { imageFit: 'cover' })}
                          className={`p-1 border transition-all ${selectedBlock.imageFit === 'cover' ? 'bg-swiss-red border-swiss-red text-white' : 'bg-white border-black/10 text-black/40'}`}
                        >
                          <Scaling size={12} />
                        </button>
                        <button 
                          onClick={() => updateBlock(selectedBlock.id, { imageFit: 'contain' })}
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
                      onChange={(v) => updateBlock(selectedBlock.id, { imageZoom: v / 100 })}
                      prefix="%"
                    />

                    <PrecisionSlider 
                      label="PAN_X" 
                      min={-200}
                      max={200}
                      value={selectedBlock.imagePanX || 0} 
                      onChange={(v) => updateBlock(selectedBlock.id, { imagePanX: v })}
                    />

                    <PrecisionSlider 
                      label="PAN_Y" 
                      min={-200}
                      max={200}
                      value={selectedBlock.imagePanY || 0} 
                      onChange={(v) => updateBlock(selectedBlock.id, { imagePanY: v })}
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
                    setBlocks(prev => applyCompact(prev.filter(b => b.id !== selectedId)));
                    setSelectedId(null);
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
    </div>
  );
}

function EditableTextBlock({ block, updateBlock }: { block: LayoutBlock, updateBlock: (id: string, updates: Partial<LayoutBlock>) => void }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) setHasOverflow(el.scrollHeight > el.clientHeight);
  }, [block.label, block.fontSize, block.w, block.h]);

  return (
    <div className="w-full h-full relative group/text overflow-hidden flex items-start justify-start">
      <textarea
        ref={textareaRef}
        value={block.label}
        onChange={(e) => updateBlock(block.id, { label: e.target.value })}
        placeholder="TYPE_HERE..."
        style={{ 
          fontFamily: block.fontFamily || 'monospace',
          fontWeight: block.fontWeight === 'black' ? 900 : block.fontWeight === 'bold' ? 700 : 400,
          fontSize: `${block.fontSize || 13}px`,
          textAlign: block.textAlign || 'left',
          color: 'inherit',
        }}
        className="w-full h-full bg-transparent border-none resize-none outline-none text-left leading-snug placeholder:opacity-20 scrollbar-hide"
        onClick={(e) => e.stopPropagation()}
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

function GridView({ showGrid }: { showGrid: boolean }) {
  if (!showGrid) return null;
  return (
    <div className="absolute inset-0 pointer-events-none select-none">
      <div className="absolute inset-0 border border-swiss-red/20 opacity-50" style={{ margin: MARGIN - 1 }} />
      <div 
        className="absolute inset-0 grid"
        style={{ 
          padding: MARGIN,
          gap: GUTTER,
          gridTemplateColumns: `repeat(${COLUMNS}, ${COL_WIDTH}px)`,
          gridTemplateRows: `repeat(${ROWS}, ${ROW_HEIGHT}px)`
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
        <span>Canvas: 16:9</span>
        <span>Resolution: 960x540</span>
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
