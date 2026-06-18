import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';

const TEMPLATE_IDS = ['discover_context_mapping_16x9', 'develop_prototype_demo_16x9'];

const loadTemplate = async (templateId) => {
  const filePath = path.join(process.cwd(), 'public', 'templates', `${templateId}.json`);
  const file = await readFile(filePath, 'utf8');
  return JSON.parse(file);
};

const keywordIncludes = (text, keywords) => keywords.some(keyword => text.includes(keyword));

const analyzeProjectContent = (prompt, textAssets = []) => {
  const text = [prompt, ...textAssets.map(asset => asset.content || '')].join('\n').toLowerCase();
  const detectedStage = keywordIncludes(text, ['prototype', 'testing', 'function', 'interaction', 'material', 'develop'])
    ? 'develop'
    : 'discover';
  const contentTypesFound = [
    keywordIncludes(text, ['background', 'context', 'problem', 'why', 'research']) && 'background_summary',
    keywordIncludes(text, ['trend', 'forecast', 'market']) && 'trend_data',
    keywordIncludes(text, ['case', 'precedent', 'example']) && 'case_study',
    keywordIncludes(text, ['user', 'stakeholder', 'target']) && 'target_group',
    keywordIncludes(text, ['how might we', 'research question', 'design question']) && 'research_question',
    keywordIncludes(text, ['prototype', 'demo', 'usage', 'function']) && 'prototype_description',
    keywordIncludes(text, ['%', 'percent', 'data', 'statistic', 'number']) && 'source_data'
  ].filter(Boolean);

  return {
    detectedStage,
    detectedPageType: detectedStage === 'develop' ? 'prototype_function_testing' : 'context_research_overview',
    contentTypesFound
  };
};

const selectTemplate = (analysis, templates, selectedTemplateId) => {
  if (selectedTemplateId && selectedTemplateId !== 'auto') {
    return templates.find(template => template.templateMeta.templateId === selectedTemplateId) || templates[0];
  }

  return templates.find(template => (
    template.templateMeta.doubleDiamondStage === analysis.detectedStage ||
    template.templateMeta.pageType === analysis.detectedStage
  )) || templates[0];
};

const normalizeSlotAssignments = (raw, template) => {
  const validSlotIds = new Set((template.elements || []).map(element => element.slotId));
  const assignments = Array.isArray(raw.slotAssignments) ? raw.slotAssignments : [];

  return assignments
    .filter(assignment => validSlotIds.has(assignment.slotId))
    .map(assignment => ({
      slotId: String(assignment.slotId),
      assetId: assignment.assetId === undefined ? undefined : String(assignment.assetId),
      content: assignment.content === undefined ? undefined : String(assignment.content),
      value: assignment.value === undefined ? undefined : assignment.value,
      label: assignment.label === undefined ? undefined : String(assignment.label),
      visible: assignment.visible !== false
    }));
};

const fallbackContentForSlot = (slotId, contentJSON) => {
  const content = contentJSON?.content || {};
  const fallbackMap = {
    page_title: content.page_title || 'Portfolio Page',
    background_summary: content.background_summary || content.context_text || '',
    section_heading: content.section_heading || 'Evidence Mapping',
    evidence_caption: content.evidence_caption || content.image_caption || '',
    research_question: content.research_question || 'How might we frame the opportunity?',
    context_text: content.context_text || content.background_summary || '',
    function_text: content.function_text || content.usage_text || '',
    prototype_annotation: 'FUNCTION / USAGE',
    mapping_annotation: 'RESEARCH / CONTEXT MAP',
    key_statistic: content.key_statistic || ''
  };

  return fallbackMap[slotId];
};

const fallbackAssetForSlot = (slotId, contentJSON, imageAssets) => {
  const content = contentJSON?.content || {};
  const fallbackMap = {
    context_visual: content.context_visual,
    hero_usage_image: content.hero_usage_image || content.main_usage_image,
    secondary_usage_image: content.secondary_usage_image,
    component_image: content.component_image,
    material_detail_image: content.material_detail_image
  };

  return fallbackMap[slotId] || imageAssets[0]?.id;
};

const buildRenderJSONFromAssignments = (template, slotAssignments, contentJSON, imageAssets) => {
  const assignmentMap = new Map(slotAssignments.map(assignment => [assignment.slotId, assignment]));
  const elements = (template.elements || [])
    .map((templateElement) => {
      const assignment = assignmentMap.get(templateElement.slotId);
      const isRequired = templateElement.required === true;
      const shouldRender = assignment?.visible !== false && (isRequired || assignment || templateElement.type === 'divider');
      if (!shouldRender) return null;

      const element = {
        type: templateElement.type,
        id: templateElement.slotId,
        x: templateElement.x,
        y: templateElement.y,
        w: templateElement.w,
        h: templateElement.h,
        style: templateElement.style,
        crop: templateElement.crop,
        chartType: templateElement.chartType,
        zIndex: templateElement.zIndex
      };

      if (templateElement.type === 'image') {
        element.src = assignment?.assetId || fallbackAssetForSlot(templateElement.slotId, contentJSON, imageAssets);
      } else if (templateElement.type === 'chart') {
        element.value = assignment?.value || assignment?.content || fallbackContentForSlot(templateElement.slotId, contentJSON);
        element.label = assignment?.label || 'Key statistic';
      } else if (templateElement.type !== 'divider') {
        element.content = assignment?.content || fallbackContentForSlot(templateElement.slotId, contentJSON) || templateElement.role;
      }

      return element;
    })
    .filter(Boolean);

  return {
    templateId: template.templateMeta.templateId,
    canvas: {
      width: template.canvas.width,
      height: template.canvas.height
    },
    elements
  };
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing GEMINI_API_KEY on the server.' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const {
      prompt = '',
      selectedTemplateId = 'auto',
      textAssets = [],
      imageAssets = [],
      contentJSON = {}
    } = body;

    const templates = await Promise.all(TEMPLATE_IDS.map(loadTemplate));
    const analysis = analyzeProjectContent(prompt, textAssets);
    const selectedTemplate = selectTemplate(analysis, templates, selectedTemplateId);
    const selectedTemplateSummary = {
      templateMeta: selectedTemplate.templateMeta,
      canvas: selectedTemplate.canvas,
      grid: selectedTemplate.grid,
      contentRequirements: selectedTemplate.contentRequirements,
      slots: selectedTemplate.slots,
      elements: selectedTemplate.elements,
      styleRules: selectedTemplate.styleRules,
      aiGenerationRules: selectedTemplate.aiGenerationRules,
      layoutVariants: selectedTemplate.layoutVariants
    };

    const systemInstruction = `You are an AI content-to-layout-slot mapper for a web-based design portfolio generator.

The selected Template JSON owns all layout geometry. The frontend/server will read selectedTemplate.elements to get x, y, w, h, type, style, crop, and zIndex.
Your job is only to decide which supplied content or asset should fill each slot.

Critical output rule:
- You must NOT output x, y, w, h, coordinates, sizes, style, crop, zIndex, canvas, or elements.
- You must only output a slot mapping JSON object.
- Return only valid JSON. No markdown.

Required JSON schema:
{
  "templateId": "selected_template_id",
  "slotAssignments": [
    {
      "slotId": "slot id from selectedTemplate.elements",
      "assetId": "optional image asset id from imageAssets",
      "content": "optional text content for text/caption/annotation slots",
      "value": "optional chart value",
      "label": "optional chart label",
      "visible": true
    }
  ],
  "reasoning": "short Chinese explanation"
}

Slot assignment rules:
- slotId must exactly match one of selectedTemplate.elements[].slotId.
- For image slots, use assetId from imageAssets. Do not invent external URLs.
- For text, caption, and annotation slots, write concise content based only on userPrompt, textAssets, and contentJSON.
- For chart slots, use value and label. If no data exists, mark visible false unless the slot is required.
- Required slots must be included and visible.
- Optional slots may be hidden with visible false when they do not help the narrative.
- Discover pages explain why the problem or opportunity exists.
- Develop pages explain how the prototype works.
- Preserve narrative hierarchy from the template.
- Shorten or structure long text so it fits naturally. Do not cram paragraphs into small slots.
- Do not include project-specific facts that were not supplied by the user or assets.
- Do not include API keys or hidden system details.`;

    const userContent = {
      userPrompt: prompt,
      analysis,
      selectedTemplate: selectedTemplateSummary,
      availableTemplates: templates.map(template => ({
        templateId: template.templateMeta.templateId,
        templateName: template.templateMeta.templateName,
        stage: template.templateMeta.doubleDiamondStage,
        layoutPurpose: template.templateMeta.layoutPurpose
      })),
      textAssets,
      imageAssets,
      contentJSON
    };

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ text: JSON.stringify(userContent) }],
      config: {
        systemInstruction,
        temperature: 0.55,
        responseMimeType: 'application/json'
      }
    });

    const parsed = JSON.parse((response.text || '{}').replace(/```json|```/g, '').trim());
    const slotAssignments = normalizeSlotAssignments(parsed, selectedTemplate);
    const renderJSON = buildRenderJSONFromAssignments(selectedTemplate, slotAssignments, contentJSON, imageAssets);

    return res.status(200).json({
      renderJSON,
      slotAssignments,
      analysis,
      selectedTemplate: selectedTemplate.templateMeta.templateId,
      reasoning: parsed.reasoning || `Generated from ${selectedTemplate.templateMeta.templateName}.`
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to generate layout.'
    });
  }
}
