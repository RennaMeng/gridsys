import { LayoutBlock } from '../types';

export type TemplateId = 'discover_context_mapping_16x9' | 'develop_prototype_demo_16x9' | 'deliver_final_outcome_16x9';

export type TemplateStage = 'discover' | 'define' | 'develop' | 'deliver';

export type TemplateJSON = {
  templateMeta: {
    templateId: string;
    templateName: string;
    pageType: TemplateStage | string;
    doubleDiamondStage: TemplateStage | string;
    layoutPurpose: string;
    narrativeRole: string;
    suitableFor: string[];
  };
  canvas: {
    ratio: string;
  };
  grid: {
    columns: number;
    rows: number;
    columnGap: number;
    rowGap: number;
    margin?: number;
    layoutDensity: string;
    alignment: string;
    type: string;
    coordinateSystem?: '12x8_grid' | '24x16_grid' | string;
  };
  elements?: Array<{
    slotId: string;
    type: RenderElement['type'];
    role: string;
    x: number;
    y: number;
    w: number;
    h: number;
    style?: string;
    crop?: 'cover' | 'contain';
    chartType?: string;
    zIndex?: number;
    required?: boolean;
    textRules?: TextRules;
  }>;
  contentRequirements: {
    required: string[];
    optional: string[];
  };
  slots: {
    textSlots?: Array<Record<string, unknown> & { id: string; role: string; required?: boolean }>;
    imageSlots?: Array<Record<string, unknown> & { id: string; role: string; required?: boolean }>;
    dataSlots?: Array<Record<string, unknown> & { id: string; role: string; required?: boolean }>;
    mappingSlots?: Array<Record<string, unknown> & { id: string; role: string; required?: boolean }>;
    captionSlots?: Array<Record<string, unknown> & { id: string; role: string; required?: boolean }>;
  };
  styleRules: Record<string, unknown>;
  aiGenerationRules: Record<string, unknown>;
  layoutVariants: Array<Record<string, unknown> & { variantId: string; layoutLogic: string }>;
  layoutRules?: Record<string, unknown>;
  designSystem?: Record<string, unknown>;
  sections?: Array<Record<string, unknown>>;
  groups?: Array<Record<string, unknown>>;
};

export type TextRules = {
  maxChars?: number;
  fontSize?: number;
  lineClamp?: number;
  overflow?: 'clip' | 'visible' | 'autoHeight';
  padding?: number;
};

export type ContentJSON = {
  projectId?: string;
  stage?: TemplateStage | string;
  contentTypes?: string[];
  content: Record<string, unknown>;
};

export type AnalysisResult = {
  detectedStage: TemplateStage;
  detectedPageType: string;
  contentTypesFound: string[];
  missingContent: string[];
};

export type FilledTemplate = {
  templateId: string;
  filledContent: Record<string, unknown>;
  missingRequiredSlots: string[];
};

export type RenderElement = {
  type: 'text' | 'image' | 'chart' | 'timeline' | 'mapping' | 'shape' | 'divider' | 'annotation' | 'caption';
  id: string;
  content?: string;
  src?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  style?: string;
  crop?: 'cover' | 'contain';
  chartType?: string;
  value?: number | string;
  label?: string;
  zIndex?: number;
  textRules?: TextRules;
};

export type RenderJSON = {
  templateId: string;
  canvas: {
    width: number;
    height: number;
  };
  elements: RenderElement[];
};

export type TemplateSelection = {
  selectedTemplate: string;
  reason: string;
};

export type LayoutBlockRenderer = (renderJSON: RenderJSON) => LayoutBlock[];
