import { FilledTemplate, RenderElement, RenderJSON, TemplateJSON } from './templateTypes';

const text = (id: string, content: unknown, x: number, y: number, w: number, h: number, style: string, zIndex = 2): RenderElement => ({
  type: style === 'caption' ? 'caption' : 'text',
  id,
  content: String(content || ''),
  x,
  y,
  w,
  h,
  style,
  zIndex
});

const image = (id: string, src: unknown, x: number, y: number, w: number, h: number, zIndex = 1): RenderElement => ({
  type: 'image',
  id,
  src: typeof src === 'string' ? src : '',
  x,
  y,
  w,
  h,
  crop: 'cover',
  zIndex
});

export function generateRenderJSON(template: TemplateJSON, filledTemplate: FilledTemplate): RenderJSON {
  const content = filledTemplate.filledContent;
  const isDevelop = template.templateMeta.doubleDiamondStage === 'develop';
  const elements: RenderElement[] = isDevelop
    ? [
        text('page_title', content.page_title || 'Prototype Demo', 100, 80, 650, 95, 'title', 4),
        text('context_text', content.context_text || content.background_summary || 'Context label', 100, 190, 460, 95, 'body', 4),
        image('hero_usage_image', content.hero_usage_image || content.main_usage_image, 700, 140, 1120, 600, 1),
        text('function_text', content.function_text || content.usage_text || 'Functional explanation', 100, 760, 620, 180, 'body', 4),
        image('secondary_usage_image', content.secondary_usage_image || content.component_image, 760, 770, 460, 210, 1),
        image('component_image', content.component_image || content.material_detail_image, 1280, 770, 540, 210, 1),
        { type: 'annotation', id: 'prototype_annotation', content: 'FUNCTION / USAGE', x: 1320, y: 160, w: 320, h: 60, style: 'annotation', zIndex: 5 }
      ]
    : [
        text('page_title', content.page_title || 'Background', 70, 60, 760, 95, 'title', 4),
        image('context_visual', content.context_visual, 70, 210, 700, 360, 1),
        text('background_summary', content.background_summary || 'Background summary', 830, 210, 540, 250, 'body', 4),
        { type: 'chart', id: 'key_statistic', value: content.key_statistic as string || '66%', label: 'Key statistic', x: 1440, y: 210, w: 360, h: 250, style: 'chart', zIndex: 3 },
        { type: 'divider', id: 'research_divider', x: 830, y: 510, w: 970, h: 4, style: 'divider', zIndex: 2 },
        text('section_heading', content.section_heading || 'Evidence Mapping', 70, 650, 440, 70, 'heading', 4),
        text('evidence_caption', content.evidence_caption || content.category_map || 'Evidence or mapping notes', 70, 735, 520, 130, 'caption', 4),
        text('research_question', content.research_question || 'How might we frame the opportunity?', 690, 670, 760, 150, 'title', 5),
        { type: 'annotation', id: 'mapping_annotation', content: 'RESEARCH / CONTEXT MAP', x: 1460, y: 690, w: 340, h: 80, style: 'annotation', zIndex: 5 }
      ];

  return {
    templateId: template.templateMeta.templateId,
    canvas: {
      width: template.grid.columns,
      height: template.grid.rows
    },
    elements
  };
}
