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

const sanitizeRenderJSON = (raw, template) => {
  const canvas = raw.canvas || template.canvas || { width: 1920, height: 1080 };
  const elements = Array.isArray(raw.elements) ? raw.elements : [];

  return {
    templateId: raw.templateId || template.templateMeta.templateId,
    canvas: {
      width: Number(canvas.width) || 1920,
      height: Number(canvas.height) || 1080
    },
    elements: elements.slice(0, 18).map((element, index) => {
      const type = ['text', 'image', 'chart', 'timeline', 'mapping', 'shape', 'divider', 'annotation', 'caption'].includes(element.type)
        ? element.type
        : 'text';

      return {
        type,
        id: String(element.id || `${type}_${index + 1}`),
        content: element.content === undefined ? undefined : String(element.content),
        src: element.src === undefined ? undefined : String(element.src),
        x: Math.max(0, Number(element.x) || 0),
        y: Math.max(0, Number(element.y) || 0),
        w: Math.max(20, Number(element.w) || 240),
        h: Math.max(20, Number(element.h) || 120),
        style: element.style ? String(element.style) : undefined,
        crop: element.crop === 'contain' ? 'contain' : 'cover',
        chartType: element.chartType ? String(element.chartType) : undefined,
        value: element.value,
        label: element.label ? String(element.label) : undefined,
        zIndex: Number(element.zIndex) || index + 1
      };
    })
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
      styleRules: selectedTemplate.styleRules,
      aiGenerationRules: selectedTemplate.aiGenerationRules,
      layoutVariants: selectedTemplate.layoutVariants
    };

    const systemInstruction = `You are an AI layout engine for a web-based design portfolio generator.

Use the selected Template JSON as a rule system and narrative reference, not as a fixed layout.
You must adapt the final Render JSON according to the user's prompt, available text assets, image assets, and content JSON.

Rules:
- Return only valid JSON. No markdown.
- Output must match this shape: { "templateId": string, "canvas": { "width": 1920, "height": 1080 }, "elements": [] }
- Supported element types: text, image, chart, timeline, mapping, shape, divider, annotation, caption.
- Coordinates are absolute pixels on a 1920x1080 canvas unless the template says otherwise.
- Keep required narrative hierarchy visible.
- Discover pages explain why the problem or opportunity exists.
- Develop pages explain how the prototype works.
- Use image element "src" as an image asset id from the provided imageAssets list. Do not invent external URLs.
- Use text assets exactly where helpful, but you may edit, shorten, structure, and combine them.
- Text should not be visually compressed. Prefer visible overflow, larger boxes, or fewer words.
- Allow editorial overlap between image and text when it improves hierarchy.
- Use zIndex intentionally for overlap.
- Do not include project-specific content that was not supplied by the user or assets.
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
    const renderJSON = sanitizeRenderJSON(parsed, selectedTemplate);

    return res.status(200).json({
      renderJSON,
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
