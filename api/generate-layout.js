import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';

const TEMPLATE_IDS = ['discover_context_mapping_16x9', 'develop_prototype_demo_16x9', 'deliver_final_outcome_16x9'];

const loadTemplate = async (templateId) => {
  const filePath = path.join(process.cwd(), 'public', 'templates', `${templateId}.json`);
  const file = await readFile(filePath, 'utf8');
  return JSON.parse(file);
};

const keywordIncludes = (text, keywords) => keywords.some(keyword => text.includes(keyword));

const analyzeProjectContent = (prompt, textAssets = []) => {
  const text = [prompt, ...textAssets.map(asset => asset.content || '')].join('\n').toLowerCase();
  const detectedStage = keywordIncludes(text, ['deliver', 'final outcome', 'final design', 'showcase', 'participant', 'feedback', 'validation'])
    ? 'deliver'
    : keywordIncludes(text, ['prototype', 'testing', 'function', 'interaction', 'material', 'develop'])
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
    detectedPageType: detectedStage === 'deliver'
      ? 'final_outcome_and_validation_summary'
      : detectedStage === 'develop'
        ? 'prototype_function_testing'
        : 'context_research_overview',
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

const parseDataUrl = (dataUrl = '') => {
  const match = String(dataUrl).match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    data: match[2]
  };
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
    participant_a_feedback: content.participant_a_feedback || content.feedback_a || '',
    participant_b_feedback: content.participant_b_feedback || content.feedback_b || '',
    participant_c_feedback: content.participant_c_feedback || content.feedback_c || '',
    participant_d_feedback: content.participant_d_feedback || content.feedback_d || '',
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
    category_collage_image: content.category_collage_image || imageAssets[0]?.id,
    category_summary_image: content.category_summary_image || imageAssets[1]?.id || imageAssets[0]?.id,
    context_visual_a: content.context_visual_a || imageAssets[2]?.id || content.context_visual || imageAssets[0]?.id,
    context_visual_b: content.context_visual_b || imageAssets[3]?.id || imageAssets[1]?.id || content.context_visual,
    statistic_image_a: content.statistic_image_a || imageAssets[4]?.id || imageAssets[0]?.id,
    statistic_image_b: content.statistic_image_b || imageAssets[5]?.id || imageAssets[1]?.id,
    statistic_image_c: content.statistic_image_c || imageAssets[6]?.id || imageAssets[2]?.id,
    statistic_image_d: content.statistic_image_d || imageAssets[7]?.id || imageAssets[3]?.id,
    case_image_a: content.case_image_a || imageAssets[8]?.id || imageAssets[2]?.id,
    case_image_b: content.case_image_b || imageAssets[9]?.id || imageAssets[3]?.id,
    case_image_c: content.case_image_c || imageAssets[10]?.id || imageAssets[4]?.id,
    case_image_d: content.case_image_d || imageAssets[11]?.id || imageAssets[5]?.id,
    hero_usage_image: content.hero_usage_image || content.main_usage_image,
    secondary_usage_image: content.secondary_usage_image,
    component_image: content.component_image,
    material_detail_image: content.material_detail_image,
    hero_outcome_image: content.hero_outcome_image || content.hero_usage_image || content.main_usage_image,
    component_spread_image: content.component_spread_image || content.component_image,
    testing_image_a: content.testing_image_a || content.secondary_usage_image,
    testing_image_b: content.testing_image_b || content.material_detail_image,
    scenario_image_foot: content.scenario_image_foot || content.secondary_usage_image,
    scenario_image_hands: content.scenario_image_hands || content.component_image,
    scenario_image_arm: content.scenario_image_arm || content.material_detail_image,
    module_card_foot: content.module_card_foot || content.component_image,
    module_card_hands: content.module_card_hands || content.material_detail_image,
    module_card_arm: content.module_card_arm || content.context_visual,
    diagram_overlay_image: content.diagram_overlay_image || content.module_card_arm
  };

  return fallbackMap[slotId] || imageAssets[0]?.id;
};

const fitTextToRule = (value, textRules) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  const maxChars = Number(textRules?.maxChars) || 0;
  if (!maxChars || text.length <= maxChars) return text;

  const clipped = text.slice(0, Math.max(0, maxChars - 1)).trim();
  const lastSpace = clipped.lastIndexOf(' ');
  return `${(lastSpace > maxChars * 0.65 ? clipped.slice(0, lastSpace) : clipped).trim()}…`;
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
        zIndex: templateElement.zIndex,
        textRules: templateElement.textRules
      };

      if (templateElement.type === 'image') {
        element.src = assignment?.assetId || fallbackAssetForSlot(templateElement.slotId, contentJSON, imageAssets);
      } else if (templateElement.type === 'chart') {
        element.value = fitTextToRule(assignment?.value || assignment?.content || fallbackContentForSlot(templateElement.slotId, contentJSON), templateElement.textRules);
        element.label = fitTextToRule(assignment?.label || 'Key statistic', templateElement.textRules);
      } else if (templateElement.type !== 'divider') {
        element.content = fitTextToRule(assignment?.content || fallbackContentForSlot(templateElement.slotId, contentJSON) || templateElement.role, templateElement.textRules);
      }

      return element;
    })
    .filter(Boolean);

  return {
    templateId: template.templateMeta.templateId,
    canvas: {
      width: template.grid.columns,
      height: template.grid.rows
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
      referenceEnabled = false,
      textAssets = [],
      imageAssets = [],
      referenceImages = [],
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

The selected Template JSON owns all layout geometry. The frontend/server will read selectedTemplate.elements to get 12x8 grid x, y, w, h, type, style, crop, and zIndex.
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
- Follow each selectedTemplate.elements[].textRules exactly when present. Never exceed maxChars.
- For chart slots, use value and label. If no data exists, mark visible false unless the slot is required.
- Required slots must be included and visible.
- Optional slots may be hidden with visible false when they do not help the narrative.
- Discover pages explain why the problem or opportunity exists.
- For Discover templates, charts, statistics, diagrams, and collage references are represented as image slots when matching image slots exist. Prefer filling image-heavy slots with uploaded imageAssets before hiding them.
- If referenceEnabled is true and reference layout images are provided, study their visual rhythm, image/text balance, density, hierarchy, and approximate composition. Use the selected template slots as the implementation boundary, but choose visible slots and asset order to resemble the reference layout more than the default template.
- Develop pages explain how the prototype works.
- Deliver pages present the final outcome, validation feedback, usage scenarios, and component system.
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
      referenceEnabled,
      referenceImages: referenceEnabled
        ? referenceImages.map(image => ({
          id: image.id,
          name: image.name,
          width: image.width,
          height: image.height
        }))
        : [],
      contentJSON
    };

    const referenceParts = referenceEnabled
      ? referenceImages
        .map(image => {
          const parsed = parseDataUrl(image.dataUrl);
          return parsed
            ? {
              inlineData: {
                mimeType: parsed.mimeType,
                data: parsed.data
              }
            }
            : null;
        })
        .filter(Boolean)
      : [];

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(userContent) }, ...referenceParts] }],
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
