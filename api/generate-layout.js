import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';

const DEFAULT_TEMPLATE_IDS = [
  'discover_context_mapping_16x9',
  'discover_long_medical_strip',
  'define_concept_sketch_long_16x9',
  'develop_prototype_demo_16x9',
  'deliver_final_outcome_16x9'
];
const REFERENCE_GRID_WIDTH = 24;
const REFERENCE_GRID_HEIGHT = 16;
const ASSET_VISUAL_TYPES = new Set(['portrait', 'chart', 'diagram', 'product_photo', 'field_photo', 'screenshot']);
const ASSET_DENSITIES = new Set(['high', 'medium', 'low']);
const ASSET_ROLES = new Set(['hero_image', 'supporting_image', 'diagram_image', 'data_visualization', 'icon_image', 'background_image', 'portrait_image', 'product_image']);

const VISUAL_TYPE_TO_ROLE = {
  portrait: 'portrait_image',
  chart: 'data_visualization',
  diagram: 'diagram_image',
  product_photo: 'product_image',
  field_photo: 'supporting_image',
  screenshot: 'supporting_image'
};

const loadTemplateIds = async () => {
  try {
    const manifestPath = path.join(process.cwd(), 'public', 'templates', 'template-manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const templateIds = Array.isArray(manifest.templates)
      ? manifest.templates.map(template => template.templateId).filter(Boolean)
      : [];
    return templateIds.length ? templateIds : DEFAULT_TEMPLATE_IDS;
  } catch {
    return DEFAULT_TEMPLATE_IDS;
  }
};

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
      : keywordIncludes(text, ['define', 'solution', 'sketch', 'concept', '方案', '草图', '材料', '实验'])
        ? 'define'
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
        : detectedStage === 'define'
          ? 'solution_sketch_and_concept_definition'
          : 'context_research_overview',
    contentTypesFound
  };
};

const countMatches = (text, keywords) => keywords.reduce((count, keyword) => count + (text.includes(keyword) ? 1 : 0), 0);

const buildContentProfile = ({ prompt = '', textAssets = [], imageAssets = [], contentJSON = {}, analysis, canvasPresetId = 'digital-16-9' }) => {
  const contentText = [
    prompt,
    ...textAssets.map(asset => `${asset.title || ''}\n${asset.content || ''}`),
    JSON.stringify(contentJSON?.content || {})
  ].join('\n').toLowerCase();
  const titleCount = textAssets.filter(asset => asset.type === 'title' || /title|heading|标题/.test(`${asset.title || ''} ${asset.content || ''}`.toLowerCase())).length;
  const bodyCount = textAssets.filter(asset => asset.type !== 'title').length;
  const profiledChartCount = imageAssets.filter(asset => {
    const profile = asset.assetProfile || {};
    return profile.visualType === 'chart' || profile.visualType === 'diagram' || profile.recommendedRole === 'data_visualization' || profile.recommendedRole === 'diagram_image';
  }).length;
  const chartCount = countMatches(contentText, ['chart', 'diagram', 'graph', '图表', '数据图', 'mapping', 'map']) + profiledChartCount;
  const dataPointCount = (contentText.match(/\d+(\.\d+)?%|\b\d+(\.\d+)?\b/g) || []).length;
  const stepCount = countMatches(contentText, ['step', 'process', 'flow', 'stage', 'timeline', '步骤', '流程', '阶段', '实验', 'iteration']);
  const comparisonCount = countMatches(contentText, ['compare', 'versus', 'vs', 'before', 'after', '对比', '前后']);
  const density = imageAssets.length + textAssets.length + dataPointCount >= 18
    ? 'high'
    : imageAssets.length + textAssets.length >= 8
      ? 'medium'
      : 'low';

  return {
    stage: analysis.detectedStage,
    pageType: analysis.detectedPageType,
    counts: {
      title: Math.max(titleCount, countMatches(contentText, ['title', 'heading', '标题'])),
      body: bodyCount,
      image: imageAssets.length,
      chart: chartCount,
      dataPoint: dataPointCount,
      step: stepCount,
      comparison: comparisonCount
    },
    needs: {
      highImageCapacity: imageAssets.length >= 6,
      diagramOrChartSlots: chartCount > 0 || dataPointCount >= 3,
      processOrStepLayout: stepCount > 0,
      comparisonLayout: comparisonCount > 0,
      solutionSketchLayout: analysis.detectedStage === 'define' || keywordIncludes(contentText, ['solution', 'sketch', 'concept', '方案', '草图', '实验'])
    },
    canvasPresetId,
    canvasRatio: canvasPresetId === 'strip-1800-768' ? '1800:768' : '16:9',
    density,
    keywords: analysis.contentTypesFound
  };
};

const scoreTemplateMatch = (contentProfile, template) => {
  const profile = template.templateProfile || {};
  const structure = profile.structure || {};
  const stage = template.templateMeta?.doubleDiamondStage || template.templateMeta?.pageType || profile.stage;
  const reasons = [];
  const risks = [];
  let score = 0;
  const templateId = template.templateMeta?.templateId || '';
  const isStripTemplate = templateId === 'discover_long_medical_strip' || profile.canvas?.ratio === '1800:768';
  const isStripCanvas = contentProfile.canvasPresetId === 'strip-1800-768';

  if (isStripTemplate && !isStripCanvas) {
    return {
      templateId,
      score: 0,
      reason: ['strip template is disabled outside 1800x768 canvas'],
      risk: ['requires STRIP_1800x768 viewport']
    };
  }

  if (!isStripTemplate && isStripCanvas && stage === 'discover') {
    score -= 12;
    risks.push('16:9 discover template may not fit strip canvas');
  }

  if (stage === contentProfile.stage) {
    score += 28;
    reasons.push(`matches ${contentProfile.stage} stage`);
  } else if (contentProfile.stage === 'discover' && stage === 'define' && contentProfile.needs.solutionSketchLayout) {
    score += 16;
    reasons.push('supports early problem-to-solution framing');
  } else {
    risks.push(`stage is ${stage}, content looks like ${contentProfile.stage}`);
  }

  const imageSlots = Number(structure.imageSlotCount ?? (template.elements || []).filter(element => element.type === 'image').length);
  const textSlots = Number(structure.textSlotCount ?? (template.elements || []).filter(element => element.type !== 'image' && element.type !== 'divider').length);
  const chartSlots = Number(structure.chartSlotCount ?? (template.elements || []).filter(element => element.type === 'chart').length);

  if (imageSlots >= contentProfile.counts.image) {
    score += 18;
    reasons.push('has enough image slots');
  } else if (imageSlots > 0) {
    score += Math.max(4, Math.round((imageSlots / Math.max(contentProfile.counts.image, 1)) * 14));
    risks.push('some uploaded images may be unused or grouped');
  }

  if (textSlots >= Math.max(1, contentProfile.counts.title + contentProfile.counts.body)) {
    score += 14;
    reasons.push('has enough text slots');
  } else {
    risks.push('body text may need compression');
  }

  if (contentProfile.needs.diagramOrChartSlots) {
    if (chartSlots > 0 || imageSlots >= 4 || /diagram|mapping|chart/i.test(`${profile.pageIntent || ''} ${template.templateMeta?.layoutPurpose || ''}`)) {
      score += 10;
      reasons.push('can represent charts or diagrams');
    } else {
      risks.push('limited chart or diagram support');
    }
  }

  if (contentProfile.needs.processOrStepLayout) {
    if (structure.hasProcessFlow || Number(structure.stepCount || 0) >= 3) {
      score += 10;
      reasons.push('supports process or step sequence');
    } else {
      risks.push('process content may need simplification');
    }
  }

  if (contentProfile.needs.solutionSketchLayout) {
    if (structure.hasSketchArea || /solution|sketch|experiment|concept/i.test(`${profile.pageIntent || ''} ${template.templateMeta?.layoutPurpose || ''}`)) {
      score += 14;
      reasons.push('supports solution sketch logic');
    }
  }

  if (structure.density === contentProfile.density) {
    score += 6;
    reasons.push(`matches ${contentProfile.density} information density`);
  }

  if (structure.hasHeroImage && contentProfile.counts.image > 0) {
    score += 5;
    reasons.push('supports a strong hero image');
  }

  return {
    templateId,
    score: Math.max(0, Math.min(100, score)),
    reason: reasons,
    risk: risks
  };
};

const selectTemplate = (analysis, templates, selectedTemplateId, contentProfile) => {
  if (selectedTemplateId && selectedTemplateId !== 'auto') {
    const safeSelectedTemplateId = selectedTemplateId === 'discover_long_medical_strip' && contentProfile.canvasPresetId !== 'strip-1800-768'
      ? 'discover_context_mapping_16x9'
      : selectedTemplateId;
    const selected = templates.find(template => template.templateMeta.templateId === safeSelectedTemplateId) || templates[0];
    const matches = templates
      .map(template => scoreTemplateMatch(contentProfile, template))
      .sort((a, b) => b.score - a.score);
    return { selectedTemplate: selected, matches };
  }

  const matches = templates
    .map(template => scoreTemplateMatch(contentProfile, template))
    .sort((a, b) => b.score - a.score);
  const selectedId = matches[0]?.templateId;
  const selectedTemplate = templates.find(template => template.templateMeta.templateId === selectedId)
    || templates.find(template => (
      template.templateMeta.doubleDiamondStage === analysis.detectedStage ||
      template.templateMeta.pageType === analysis.detectedStage
    ))
    || templates[0];

  return { selectedTemplate, matches };
};

const parseDataUrl = (dataUrl = '') => {
  const match = String(dataUrl).match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    data: match[2]
  };
};

const normalizeAssetProfiles = (rawProfiles = [], imageAssets = []) => {
  const validAssetIds = new Set(imageAssets.map(asset => asset.id));
  const existingProfiles = new Map(imageAssets.map(asset => [asset.id, asset.assetProfile || {}]));
  return (Array.isArray(rawProfiles) ? rawProfiles : [])
    .filter(profile => validAssetIds.has(profile.assetId))
    .map(profile => {
      const visualType = ASSET_VISUAL_TYPES.has(profile.visualType)
        ? profile.visualType
        : existingProfiles.get(profile.assetId)?.visualType || 'field_photo';
      const recommendedRole = ASSET_ROLES.has(profile.recommendedRole)
        ? profile.recommendedRole
        : VISUAL_TYPE_TO_ROLE[visualType] || 'supporting_image';
      const informationDensity = ASSET_DENSITIES.has(profile.informationDensity)
        ? profile.informationDensity
        : existingProfiles.get(profile.assetId)?.informationDensity || 'medium';
      const confidence = Number(profile.confidence);

      return {
        assetId: String(profile.assetId),
        visualType,
        informationDensity,
        recommendedRole,
        subject: String(profile.subject || existingProfiles.get(profile.assetId)?.subject || '').slice(0, 120),
        bestUse: String(profile.bestUse || existingProfiles.get(profile.assetId)?.bestUse || '').slice(0, 140),
        confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.65,
        reasoning: String(profile.reasoning || 'Image profile inferred by AI.').slice(0, 180)
      };
    });
};

const buildLocalAssetProfile = (asset) => {
  const name = String(asset.name || '').toLowerCase();
  const visualType = /chart|graph|data|stat|plot|table|数据|图表/.test(name)
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

  return {
    visualType,
    informationDensity: visualType === 'chart' || visualType === 'diagram' || visualType === 'screenshot' ? 'high' : 'low',
    recommendedRole: VISUAL_TYPE_TO_ROLE[visualType] || asset.role || 'supporting_image',
    subject: `${visualType.replace('_', ' ')} inferred from file name.`,
    bestUse: 'Use according to the recommended role when matching template slots.',
    confidence: 0.4,
    reasoning: 'Local filename fallback.'
  };
};

const normalizeSlotAssignments = (raw, template, editInstruction = '') => {
  const validSlotIds = new Set((template.elements || []).map(element => element.slotId));
  const assignments = Array.isArray(raw.slotAssignments) ? raw.slotAssignments : [];
  const normalizedInstruction = String(editInstruction || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const sanitizeContent = value => {
    if (value === undefined) return undefined;
    const content = String(value);
    const normalizedContent = content.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalizedInstruction && normalizedContent === normalizedInstruction) return undefined;
    return content;
  };

  return assignments
    .filter(assignment => validSlotIds.has(assignment.slotId))
    .map(assignment => ({
      slotId: String(assignment.slotId),
      assetId: assignment.assetId === undefined ? undefined : String(assignment.assetId),
      content: sanitizeContent(assignment.content),
      value: assignment.value === undefined ? undefined : assignment.value,
      label: sanitizeContent(assignment.label),
      visible: assignment.visible !== false
    }));
};

const normalizePreviewPlan = (rawPlan = [], template) => {
  const validSlotIds = new Set((template.elements || []).map(element => element.slotId));
  const columns = Number(template.grid?.columns) || REFERENCE_GRID_WIDTH;
  const rows = Number(template.grid?.rows) || REFERENCE_GRID_HEIGHT;
  return (Array.isArray(rawPlan) ? rawPlan : [])
    .filter(item => validSlotIds.has(item.slotId))
    .map(item => {
      const x = clampNumber(item.x, 0, columns - 1, 0);
      const y = clampNumber(item.y, 0, rows - 1, 0);
      return {
        slotId: String(item.slotId),
        x,
        y,
        w: clampNumber(item.w, 1, columns - x, 4),
        h: clampNumber(item.h, 1, rows - y, 2),
        note: String(item.note || '').replace(/\s+/g, ' ').trim().slice(0, 180),
        fontSize: item.fontSize === undefined ? undefined : clampNumber(item.fontSize, 7, 36, undefined),
        lineClamp: item.lineClamp === undefined ? undefined : clampNumber(item.lineClamp, 1, 8, undefined)
      };
    });
};

const applyPreviewPlanToTemplate = (template, rawPlan = []) => {
  const previewPlan = normalizePreviewPlan(rawPlan, template);
  if (!previewPlan.length) return { template, previewPlan };

  const planMap = new Map(previewPlan.map(item => [item.slotId, item]));
  const columns = Number(template.grid?.columns) || REFERENCE_GRID_WIDTH;
  const rows = Number(template.grid?.rows) || REFERENCE_GRID_HEIGHT;
  return {
    previewPlan,
    template: {
      ...template,
      elements: (template.elements || []).map(element => {
        const plan = planMap.get(element.slotId);
        if (!plan) return element;
        const x = clampNumber(plan.x, 0, columns - 1, element.x);
        const y = clampNumber(plan.y, 0, rows - 1, element.y);
        const w = clampNumber(plan.w, 1, columns - x, element.w);
        const h = clampNumber(plan.h, 1, rows - y, element.h);
        const textRules = element.type === 'image' || element.type === 'divider'
          ? element.textRules
          : {
            ...(element.textRules || {}),
            ...(plan.fontSize ? { fontSize: plan.fontSize } : {}),
            ...(plan.lineClamp ? { lineClamp: plan.lineClamp } : {})
          };

        return {
          ...element,
          x,
          y,
          w,
          h,
          ...(plan.note ? { contentSummary: plan.note } : {}),
          ...(textRules ? { textRules } : {})
        };
      })
    }
  };
};

const fallbackContentForSlot = (slotId, contentJSON) => {
  const content = contentJSON?.content || {};
  const fallbackMap = {
    inspiration_title: content.page_title || 'Research Background',
    inspiration_subtitle: content.section_heading || content.context_text || '',
    inspiration_body_summary: content.background_summary || content.context_text || '',
    documentary_caption_left: content.evidence_caption || content.image_caption || '',
    documentary_caption_right: content.evidence_caption || content.image_caption || '',
    user_identification_title: content.user_identification_title || 'User Identification',
    age_0_6_note: content.early_user_note || content.target_group || '',
    age_6_15_note: content.core_user_note || content.target_group || '',
    age_above_15_note: content.late_user_note || content.target_group || '',
    user_identification_conclusion: content.target_group || content.background_summary || '',
    manifestations_title: content.manifestations_title || 'Manifestations & Pain Points',
    manifestations_body_summary: content.manifestations_body_summary || content.background_summary || '',
    symptom_blurred_vision: content.key_statistic || content.symptom_blurred_vision || '',
    symptom_word_overlap: content.symptom_word_overlap || content.key_statistic || '',
    symptom_difficulty_spelling: content.symptom_difficulty_spelling || content.key_statistic || '',
    symptom_letter_confusion: content.symptom_letter_confusion || content.key_statistic || '',
    manifestations_summary: content.manifestations_summary || content.research_question || '',
    negative_effect_title: content.negative_effect_title || 'Negative Effect',
    findings_title: content.findings_title || 'Findings',
    finding_multi_sensory_title: content.finding_multi_sensory_title || 'Finding 01',
    finding_multi_sensory_summary: content.finding_multi_sensory_summary || content.evidence_caption || '',
    finding_customized_guidance_title: content.finding_customized_guidance_title || 'Finding 02',
    finding_customized_guidance_summary: content.finding_customized_guidance_summary || content.evidence_caption || '',
    finding_systematic_teaching_title: content.finding_systematic_teaching_title || 'Finding 03',
    finding_systematic_teaching_summary: content.finding_systematic_teaching_summary || content.evidence_caption || '',
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

const imageSuggestionForSlot = (templateElement) => {
  const role = `${templateElement.role || ''} ${templateElement.slotId || ''} ${templateElement.contentSummary || ''}`.toLowerCase();
  if (/portrait|participant|user|interview/.test(role)) return '建议放置：人物、用户、访谈或佩戴场景类图片';
  if (/chart|data|stat|visualization/.test(role)) return '建议放置：数据图表、统计图或信息图类图片';
  if (/diagram|map|flow|system|process/.test(role)) return '建议放置：结构图、流程图、系统图或方法图类图片';
  if (/product|prototype|component|material|outcome/.test(role)) return '建议放置：产品、原型、组件或材料细节类图片';
  if (/hero|background|context/.test(role)) return '建议放置：清晰主视觉、使用场景或背景氛围类图片';
  return '建议放置：与该槽位语义匹配的图片';
};

const isAssetCompatibleWithSlot = (templateElement, asset) => {
  if (!asset) return false;
  const profile = asset.assetProfile || buildLocalAssetProfile(asset);
  const role = `${templateElement.role || ''} ${templateElement.slotId || ''} ${templateElement.contentSummary || ''}`.toLowerCase();
  const visualType = profile.visualType;
  const recommendedRole = profile.recommendedRole;
  const isChartOrDiagram = visualType === 'chart' || visualType === 'diagram' || visualType === 'screenshot' || recommendedRole === 'data_visualization' || recommendedRole === 'diagram_image';
  const isPortrait = visualType === 'portrait' || recommendedRole === 'portrait_image';
  const isProduct = visualType === 'product_photo' || recommendedRole === 'product_image';
  const isScene = visualType === 'field_photo' || recommendedRole === 'hero_image' || recommendedRole === 'supporting_image';

  if (/chart|data|stat|visualization|diagram|map|flow|system|process/.test(role)) return isChartOrDiagram;
  if (/portrait|participant|user|interview|persona|feedback/.test(role)) return isPortrait || isScene;
  if (/product|prototype|component|material|outcome|module/.test(role)) return isProduct || isScene;
  if (/testing|scenario|documentation|usage/.test(role)) return isScene || isProduct || isPortrait || visualType === 'screenshot';
  if (/hero|background|context|visual|image/.test(role)) return isScene || isProduct || isPortrait;

  return recommendedRole === 'supporting_image' || isScene;
};

const fallbackAssetForSlot = (templateElement, contentJSON, imageAssets, usedAssetIds = new Set()) => {
  const content = contentJSON?.content || {};
  const slotId = templateElement.slotId;
  const assetById = new Map(imageAssets.map(asset => [asset.id, asset]));
  const isAvailable = id => {
    const asset = assetById.get(id);
    return Boolean(asset && !usedAssetIds.has(id) && isAssetCompatibleWithSlot(templateElement, asset));
  };
  const firstAvailable = (...ids) => ids.find(isAvailable);
  const matchAsset = (...predicates) => {
    for (const predicate of predicates) {
      const found = imageAssets.find(asset => (
        !usedAssetIds.has(asset.id) &&
        isAssetCompatibleWithSlot(templateElement, asset) &&
        predicate(asset, asset.assetProfile || buildLocalAssetProfile(asset))
      ));
      if (found) return found.id;
    }
    return undefined;
  };
  const chartOrDiagramAsset = matchAsset(
    (asset, profile) => profile.recommendedRole === 'data_visualization' || profile.visualType === 'chart',
    (asset, profile) => profile.recommendedRole === 'diagram_image' || profile.visualType === 'diagram'
  );
  const portraitAsset = matchAsset((asset, profile) => profile.recommendedRole === 'portrait_image' || profile.visualType === 'portrait');
  const productAsset = matchAsset((asset, profile) => profile.recommendedRole === 'product_image' || profile.visualType === 'product_photo');
  const heroAsset = matchAsset(
    (asset, profile) => profile.recommendedRole === 'hero_image' && profile.informationDensity !== 'high',
    (asset, profile) => profile.visualType === 'field_photo' && profile.informationDensity !== 'high'
  );
  const supportingAsset = matchAsset((asset, profile) => profile.recommendedRole === 'supporting_image');
  const fallbackMap = {
    documentary_image_left: firstAvailable(portraitAsset, heroAsset, imageAssets[0]?.id),
    documentary_image_right: firstAvailable(productAsset, supportingAsset, imageAssets[1]?.id, imageAssets[0]?.id),
    age_0_6_child_image: firstAvailable(portraitAsset, imageAssets[2]?.id, imageAssets[0]?.id),
    age_0_6_curve_diagram: firstAvailable(chartOrDiagramAsset, imageAssets[3]?.id, imageAssets[1]?.id, imageAssets[0]?.id),
    age_6_15_child_image: firstAvailable(portraitAsset, imageAssets[4]?.id, imageAssets[2]?.id, imageAssets[0]?.id),
    age_6_15_curve_diagram: firstAvailable(chartOrDiagramAsset, imageAssets[5]?.id, imageAssets[3]?.id, imageAssets[1]?.id),
    age_above_15_child_image: firstAvailable(portraitAsset, imageAssets[6]?.id, imageAssets[4]?.id, imageAssets[0]?.id),
    age_above_15_curve_diagram: firstAvailable(chartOrDiagramAsset, imageAssets[7]?.id, imageAssets[5]?.id, imageAssets[1]?.id),
    manifestations_child_image: firstAvailable(portraitAsset, imageAssets[8]?.id, imageAssets[0]?.id),
    brain_illustration: firstAvailable(chartOrDiagramAsset, imageAssets[9]?.id, imageAssets[2]?.id, imageAssets[0]?.id),
    negative_effect_emotional_group: firstAvailable(portraitAsset, imageAssets[10]?.id, imageAssets[3]?.id, imageAssets[0]?.id),
    negative_effect_neurological_group: firstAvailable(chartOrDiagramAsset, imageAssets[11]?.id, imageAssets[4]?.id, imageAssets[1]?.id),
    negative_effect_support_group: firstAvailable(supportingAsset, imageAssets[12]?.id, imageAssets[5]?.id, imageAssets[2]?.id),
    context_visual: firstAvailable(content.context_visual),
    category_collage_image: firstAvailable(content.category_collage_image, supportingAsset, imageAssets[0]?.id),
    category_summary_image: firstAvailable(content.category_summary_image, chartOrDiagramAsset, imageAssets[1]?.id, imageAssets[0]?.id),
    context_visual_a: firstAvailable(content.context_visual_a, portraitAsset, imageAssets[2]?.id, content.context_visual, imageAssets[0]?.id),
    context_visual_b: firstAvailable(content.context_visual_b, productAsset, imageAssets[3]?.id, imageAssets[1]?.id, content.context_visual),
    statistic_image_a: firstAvailable(content.statistic_image_a, chartOrDiagramAsset, imageAssets[4]?.id, imageAssets[0]?.id),
    statistic_image_b: firstAvailable(content.statistic_image_b, chartOrDiagramAsset, imageAssets[5]?.id, imageAssets[1]?.id),
    statistic_image_c: firstAvailable(content.statistic_image_c, chartOrDiagramAsset, imageAssets[6]?.id, imageAssets[2]?.id),
    statistic_image_d: firstAvailable(content.statistic_image_d, chartOrDiagramAsset, imageAssets[7]?.id, imageAssets[3]?.id),
    case_image_a: firstAvailable(content.case_image_a, portraitAsset, imageAssets[8]?.id, imageAssets[2]?.id),
    case_image_b: firstAvailable(content.case_image_b, productAsset, imageAssets[9]?.id, imageAssets[3]?.id),
    case_image_c: firstAvailable(content.case_image_c, chartOrDiagramAsset, imageAssets[10]?.id, imageAssets[4]?.id),
    case_image_d: firstAvailable(content.case_image_d, supportingAsset, imageAssets[11]?.id, imageAssets[5]?.id),
    hero_usage_image: firstAvailable(content.hero_usage_image, content.main_usage_image, heroAsset),
    secondary_usage_image: firstAvailable(content.secondary_usage_image, supportingAsset),
    component_image: firstAvailable(content.component_image, productAsset),
    material_detail_image: firstAvailable(content.material_detail_image, productAsset, supportingAsset),
    hero_outcome_image: firstAvailable(content.hero_outcome_image, content.hero_usage_image, content.main_usage_image, heroAsset),
    component_spread_image: firstAvailable(content.component_spread_image, content.component_image, productAsset),
    testing_image_a: firstAvailable(content.testing_image_a, content.secondary_usage_image),
    testing_image_b: firstAvailable(content.testing_image_b, content.material_detail_image),
    scenario_image_foot: firstAvailable(content.scenario_image_foot, content.secondary_usage_image),
    scenario_image_hands: firstAvailable(content.scenario_image_hands, content.component_image),
    scenario_image_arm: firstAvailable(content.scenario_image_arm, content.material_detail_image),
    module_card_foot: firstAvailable(content.module_card_foot, content.component_image),
    module_card_hands: firstAvailable(content.module_card_hands, content.material_detail_image),
    module_card_arm: firstAvailable(content.module_card_arm, content.context_visual),
    diagram_overlay_image: firstAvailable(content.diagram_overlay_image, content.module_card_arm)
  };

  return fallbackMap[slotId] || matchAsset(() => true);
};

const fitTextToRule = (value, textRules) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  const maxChars = Number(textRules?.maxChars) || 0;
  if (!maxChars || text.length <= maxChars) return text;

  const clipped = text.slice(0, Math.max(0, maxChars - 1)).trim();
  const lastSpace = clipped.lastIndexOf(' ');
  return `${(lastSpace > maxChars * 0.65 ? clipped.slice(0, lastSpace) : clipped).trim()}…`;
};

const clampNumber = (value, min, max, fallback) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
};

const normalizeReferenceRenderJSON = (raw, imageAssets, contentJSON) => {
  const source = raw.renderJSON || raw;
  const validImageIds = new Set(imageAssets.map(asset => asset.id));
  const usedAssetIds = new Set();
  const firstUnusedImage = () => imageAssets.find(asset => !usedAssetIds.has(asset.id))?.id;
  const content = contentJSON?.content || {};
  const elements = Array.isArray(source.elements) ? source.elements : [];

  const normalized = elements
    .slice(0, 48)
    .map((element, index) => {
      const type = ['image', 'text', 'caption', 'annotation', 'shape', 'divider', 'chart'].includes(element.type)
        ? element.type
        : (element.src || element.assetId ? 'image' : 'text');
      const x = clampNumber(element.x, 0, REFERENCE_GRID_WIDTH - 1, index % REFERENCE_GRID_WIDTH);
      const y = clampNumber(element.y, 0, REFERENCE_GRID_HEIGHT - 1, Math.floor(index / 6));
      const w = clampNumber(element.w, 1, REFERENCE_GRID_WIDTH - x, type === 'image' ? 6 : 4);
      const h = clampNumber(element.h, 1, REFERENCE_GRID_HEIGHT - y, type === 'image' ? 4 : 2);
      const id = String(element.id || `reference_${type}_${index + 1}`);
      const base = {
        type,
        id,
        x,
        y,
        w,
        h,
        style: element.style,
        crop: element.crop === 'contain' ? 'contain' : 'cover',
        zIndex: clampNumber(element.zIndex, 1, 999, index + 1)
      };

      if (type === 'image') {
        const requested = element.src || element.assetId;
        const assetId = validImageIds.has(requested) && !usedAssetIds.has(requested)
          ? requested
          : firstUnusedImage();
        if (assetId) {
          usedAssetIds.add(assetId);
          return {
            ...base,
            src: assetId
          };
        }

        return {
          ...base,
          type: 'caption',
          style: 'caption',
          content: '建议放置：与该槽位语义匹配的图片',
          textRules: {
            maxChars: 72,
            fontSize: 9,
            lineClamp: 3,
            overflow: 'clip',
            padding: 6
          }
        };
      }

      return {
        ...base,
        content: fitTextToRule(
          element.content || element.label || content.page_title || content.background_summary || 'Text',
          element.textRules
        ),
        textRules: element.textRules || {
          maxChars: type === 'caption' ? 80 : 120,
          fontSize: element.style === 'title' ? 24 : 12,
          lineClamp: type === 'caption' ? 3 : 4,
          overflow: 'clip',
          padding: 8
        }
      };
    })
    .filter(element => element.type !== 'image' || element.src);

  return {
    templateId: 'uploaded_reference_layout',
    canvas: { width: REFERENCE_GRID_WIDTH, height: REFERENCE_GRID_HEIGHT },
    elements: normalized.length ? normalized : [
      {
        type: 'image',
        id: 'reference_image_1',
        src: firstUnusedImage(),
        x: 0,
        y: 0,
        w: 16,
        h: 10,
        crop: 'cover',
        zIndex: 1
      },
      {
        type: 'text',
        id: 'reference_text_1',
        content: content.page_title || 'Portfolio Layout',
        x: 0,
        y: 10,
        w: 10,
        h: 2,
        style: 'title',
        zIndex: 2,
        textRules: { maxChars: 64, fontSize: 24, lineClamp: 2, overflow: 'clip', padding: 8 }
      }
    ].filter(element => element.type !== 'image' || element.src)
  };
};

const normalizeReferenceTemplate = (raw, referenceImages = []) => {
  const source = raw.referenceTemplate || raw.template || raw;
  const rawElements = Array.isArray(source.elements) ? source.elements : [];
  const referenceImage = referenceImages[0] || {};
  const sourceCanvasBounds = source.canvasBounds || raw.canvasBounds || {};
  const canvasBounds = {
    x: clampNumber(sourceCanvasBounds.x, 0, Number.MAX_SAFE_INTEGER, 0),
    y: clampNumber(sourceCanvasBounds.y, 0, Number.MAX_SAFE_INTEGER, 0),
    w: clampNumber(sourceCanvasBounds.w || sourceCanvasBounds.width, 1, Number.MAX_SAFE_INTEGER, referenceImage.width || REFERENCE_GRID_WIDTH),
    h: clampNumber(sourceCanvasBounds.h || sourceCanvasBounds.height, 1, Number.MAX_SAFE_INTEGER, referenceImage.height || REFERENCE_GRID_HEIGHT)
  };
  const hasPixelCanvasBounds = Boolean(sourceCanvasBounds.w || sourceCanvasBounds.width || sourceCanvasBounds.h || sourceCanvasBounds.height);
  const toGridBounds = (element, index, type) => {
    const relative = element.relativeBounds || element.normalizedBounds;
    const pixel = element.pixelBounds || element.bounds;
    if (relative && Number.isFinite(Number(relative.x)) && Number.isFinite(Number(relative.y))) {
      const x = clampNumber(Number(relative.x) * REFERENCE_GRID_WIDTH, 0, REFERENCE_GRID_WIDTH - 1, index % REFERENCE_GRID_WIDTH);
      const y = clampNumber(Number(relative.y) * REFERENCE_GRID_HEIGHT, 0, REFERENCE_GRID_HEIGHT - 1, Math.floor(index / 6));
      const w = clampNumber(Number(relative.w || relative.width) * REFERENCE_GRID_WIDTH, 1, REFERENCE_GRID_WIDTH - x, type === 'image' ? 6 : 4);
      const h = clampNumber(Number(relative.h || relative.height) * REFERENCE_GRID_HEIGHT, 1, REFERENCE_GRID_HEIGHT - y, type === 'image' ? 4 : 2);
      return { x, y, w, h };
    }

    const pixelLike = pixel || (hasPixelCanvasBounds && (Number(element.x) > REFERENCE_GRID_WIDTH || Number(element.y) > REFERENCE_GRID_HEIGHT) ? element : null);
    if (pixelLike && Number.isFinite(Number(pixelLike.x)) && Number.isFinite(Number(pixelLike.y))) {
      const x = clampNumber(((Number(pixelLike.x) - canvasBounds.x) / canvasBounds.w) * REFERENCE_GRID_WIDTH, 0, REFERENCE_GRID_WIDTH - 1, index % REFERENCE_GRID_WIDTH);
      const y = clampNumber(((Number(pixelLike.y) - canvasBounds.y) / canvasBounds.h) * REFERENCE_GRID_HEIGHT, 0, REFERENCE_GRID_HEIGHT - 1, Math.floor(index / 6));
      const w = clampNumber((Number(pixelLike.w || pixelLike.width) / canvasBounds.w) * REFERENCE_GRID_WIDTH, 1, REFERENCE_GRID_WIDTH - x, type === 'image' ? 6 : 4);
      const h = clampNumber((Number(pixelLike.h || pixelLike.height) / canvasBounds.h) * REFERENCE_GRID_HEIGHT, 1, REFERENCE_GRID_HEIGHT - y, type === 'image' ? 4 : 2);
      return { x, y, w, h };
    }

    const x = clampNumber(element.x, 0, REFERENCE_GRID_WIDTH - 1, index % REFERENCE_GRID_WIDTH);
    const y = clampNumber(element.y, 0, REFERENCE_GRID_HEIGHT - 1, Math.floor(index / 6));
    const w = clampNumber(element.w, 1, REFERENCE_GRID_WIDTH - x, type === 'image' ? 6 : 4);
    const h = clampNumber(element.h, 1, REFERENCE_GRID_HEIGHT - y, type === 'image' ? 4 : 2);
    return { x, y, w, h };
  };
  const elements = rawElements
    .slice(0, 48)
    .map((element, index) => {
      const type = ['image', 'text', 'caption', 'annotation', 'shape', 'divider', 'chart'].includes(element.type)
        ? element.type
        : 'text';
      const { x, y, w, h } = toGridBounds(element, index, type);
      const role = String(element.role || (type === 'image' ? 'reference_image_slot' : 'reference_text_slot'));
      const slotId = String(element.slotId || element.id || `reference_${type}_${index + 1}`)
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .toLowerCase();

      return {
        slotId,
        type,
        role,
        x,
        y,
        w,
        h,
        style: element.style || (type === 'image' ? 'image' : index === 0 ? 'title' : 'body'),
        ...(type === 'image' ? { crop: element.crop === 'contain' ? 'contain' : 'cover' } : {}),
        zIndex: clampNumber(element.zIndex, 1, 999, index + 1),
        required: element.required === true || index < 3,
        ...(type !== 'image' && type !== 'divider' ? {
          textRules: {
            maxChars: clampNumber(element.textRules?.maxChars, 24, 180, element.style === 'title' ? 64 : 110),
            fontSize: clampNumber(element.textRules?.fontSize, 8, 48, element.style === 'title' ? 24 : 12),
            lineClamp: clampNumber(element.textRules?.lineClamp, 1, 8, element.style === 'title' ? 2 : 4),
            overflow: 'clip',
            padding: clampNumber(element.textRules?.padding, 0, 24, 8)
          }
        } : {}),
        contentSummary: String(element.contentSummary || element.role || role)
      };
    });

  const safeElements = elements.length ? elements : [
    {
      slotId: 'reference_hero_image',
      type: 'image',
      role: 'hero_image',
      x: 0,
      y: 0,
      w: 16,
      h: 10,
      style: 'image',
      crop: 'cover',
      zIndex: 1,
      required: true,
      contentSummary: 'Largest image region inferred from uploaded reference.'
    },
    {
      slotId: 'reference_title',
      type: 'text',
      role: 'title',
      x: 0,
      y: 10,
      w: 10,
      h: 2,
      style: 'title',
      zIndex: 2,
      required: true,
      textRules: { maxChars: 64, fontSize: 24, lineClamp: 2, overflow: 'clip', padding: 8 },
      contentSummary: 'Primary title region inferred from uploaded reference.'
    }
  ];

  return {
    templateMeta: {
      templateId: 'uploaded_reference_template',
      templateName: 'Uploaded Reference Template',
      pageType: 'discover',
      doubleDiamondStage: 'discover',
      layoutPurpose: 'uploaded_reference_layout_structure',
      narrativeRole: 'preserve_uploaded_reference_composition_for_asset_assignment',
      suitableFor: ['uploaded reference', 'custom layout structure', 'AI asset assignment']
    },
    canvas: {
      ratio: source.canvas?.ratio || (referenceImages[0]?.width && referenceImages[0]?.height ? `${referenceImages[0].width}:${referenceImages[0].height}` : '16:9'),
      orientation: 'landscape',
      backgroundColor: source.canvas?.backgroundColor || '#F8F6EC'
    },
    grid: {
      type: 'uploaded_reference_grid',
      columns: REFERENCE_GRID_WIDTH,
      rows: REFERENCE_GRID_HEIGHT,
      columnGap: 10,
      rowGap: 10,
      margin: 48,
      layoutDensity: source.grid?.layoutDensity || source.analysis?.density || 'medium',
      alignment: 'reference_based',
      coordinateSystem: '24x16_grid'
    },
    layoutRules: source.layoutRules || {
      density: source.analysis?.density || 'medium',
      alignToGrid: true,
      avoidOverlap: false,
      preserveSectionIntegrity: true,
      minTextPadding: 8,
      sectionGap: 12,
      preferredReadingOrder: 'left_to_right_top_to_bottom'
    },
    designSystem: source.designSystem || {
      summary: 'Inferred from uploaded reference image.'
    },
    sections: Array.isArray(source.sections) ? source.sections : [],
    groups: Array.isArray(source.groups) ? source.groups : [],
    canvasBounds: hasPixelCanvasBounds ? canvasBounds : undefined,
    elements: safeElements,
    contentRequirements: {
      required: safeElements.filter(element => element.required).map(element => element.slotId),
      optional: safeElements.filter(element => !element.required).map(element => element.slotId)
    },
    slots: {
      textSlots: safeElements
        .filter(element => element.type !== 'image' && element.type !== 'divider')
        .map(element => ({ id: element.slotId, role: element.role, required: element.required })),
      imageSlots: safeElements
        .filter(element => element.type === 'image')
        .map(element => ({ id: element.slotId, role: element.role, required: element.required, cropStyle: element.crop || 'cover' }))
    },
    styleRules: {
      visualDensity: source.analysis?.density || 'medium',
      layoutStyle: 'uploaded_reference_structure',
      preserveReferenceComposition: true
    },
    aiGenerationRules: {
      mainLogic: 'assign_user_assets_to_uploaded_reference_template',
      prioritizeUploadedImages: true,
      preserveTemplateGeometry: true,
      avoid: ['changing coordinates during assignment', 'inventing external image URLs']
    },
    layoutVariants: [
      {
        variantId: 'uploaded_reference_template',
        layoutLogic: 'reference_image_to_fixed_slot_template'
      }
    ]
  };
};

const buildTemplatePreviewRenderJSON = (template) => ({
  templateId: template.templateMeta.templateId,
  canvas: {
    width: template.grid.columns,
    height: template.grid.rows
  },
  elements: (template.elements || []).map((element, index) => ({
    type: element.type,
    id: element.slotId,
    x: element.x,
    y: element.y,
    w: element.w,
    h: element.h,
    style: element.style,
    crop: element.crop,
    zIndex: element.zIndex || index + 1,
    content: element.type === 'image' ? undefined : element.contentSummary || element.role,
    textRules: element.textRules
  }))
});

const buildRenderJSONFromAssignments = (template, slotAssignments, contentJSON, imageAssets) => {
  const assignmentMap = new Map(slotAssignments.map(assignment => [assignment.slotId, assignment]));
  const validImageIds = new Set(imageAssets.map(asset => asset.id));
  const usedAssetIds = new Set();
  const elements = (template.elements || [])
    .map((templateElement) => {
      const assignment = assignmentMap.get(templateElement.slotId);
      const isRequired = templateElement.required === true;
      const shouldRender = assignment?.visible !== false && (isRequired || assignment || templateElement.type === 'divider' || templateElement.type === 'image');
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
        const requestedAssetId = assignment?.assetId;
        const requestedAsset = imageAssets.find(asset => asset.id === requestedAssetId);
        const uniqueRequestedAssetId = requestedAssetId &&
          validImageIds.has(requestedAssetId) &&
          !usedAssetIds.has(requestedAssetId) &&
          isAssetCompatibleWithSlot(templateElement, requestedAsset)
          ? requestedAssetId
          : undefined;
        const fallbackAssetId = uniqueRequestedAssetId
          ? undefined
          : fallbackAssetForSlot(templateElement, contentJSON, imageAssets, usedAssetIds);
        const assetId = uniqueRequestedAssetId || fallbackAssetId;

        if (assetId) {
          element.src = assetId;
          usedAssetIds.add(assetId);
        } else {
          element.type = 'caption';
          element.style = 'caption';
          element.content = imageSuggestionForSlot(templateElement);
          element.textRules = {
            maxChars: 72,
            fontSize: 9,
            lineClamp: 3,
            overflow: 'clip',
            padding: 6
          };
          delete element.crop;
        }
      } else if (templateElement.type === 'chart') {
        element.value = fitTextToRule(assignment?.value || assignment?.content || fallbackContentForSlot(templateElement.slotId, contentJSON), templateElement.textRules);
        element.label = fitTextToRule(assignment?.label || 'Key statistic', templateElement.textRules);
      } else if (templateElement.type !== 'divider') {
        element.content = fitTextToRule(
          assignment?.content ||
          fallbackContentForSlot(templateElement.slotId, contentJSON) ||
          templateElement.contentSummary ||
          templateElement.role,
          templateElement.textRules
        );
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
      canvasPresetId = 'digital-16-9',
      referenceMode = 'template',
      action = 'generate-layout',
      editInstruction = '',
      customTemplate = null,
      previewPlan = [],
      textAssets = [],
      imageAssets = [],
      referenceImages = [],
      contentJSON = {}
    } = body;

    if (action === 'analyze-assets') {
      const assetsForAnalysis = imageAssets
        .filter(asset => asset?.id && asset?.dataUrl)
        .slice(0, 24);
      if (!assetsForAnalysis.length) {
        return res.status(200).json({ assetProfiles: [] });
      }

      const assetAnalysisInstruction = `You are an image asset analyst for a portfolio layout generator.

Classify each uploaded image so the layout system can assign images to fixed template slots.

Allowed visualType values:
- portrait
- chart
- diagram
- product_photo
- field_photo
- screenshot

Allowed informationDensity values:
- high
- medium
- low

Allowed recommendedRole values:
- hero_image
- supporting_image
- diagram_image
- data_visualization
- icon_image
- background_image
- portrait_image
- product_image

Return only valid JSON. No markdown.

Required schema:
{
  "assetProfiles": [
    {
      "assetId": "asset id from input",
      "visualType": "portrait | chart | diagram | product_photo | field_photo | screenshot",
      "informationDensity": "high | medium | low",
      "recommendedRole": "one allowed role",
      "subject": "what the image appears to contain, max 16 words",
      "bestUse": "where this image should be used in a portfolio layout, max 18 words",
      "confidence": 0.0,
      "reasoning": "short reason, max 20 words"
    }
  ]
}

Guidance:
- Charts, maps, tables, dashboards, and numeric infographics should usually become data_visualization.
- System drawings, process flows, wireframes, and explanatory illustrations should usually become diagram_image.
- Clear human faces or interview photos should become portrait_image.
- Product, prototype, model, component, or material-detail photos should become product_image.
- Clean low-density field photos can become hero_image; dense screenshots should not.
- subject should describe visible content, not just repeat the visualType.
- bestUse should explain the preferred layout use, such as hero, research evidence, diagram slot, interview card, product detail, or medium support slot.
- Do not invent factual content.`;

      const assetText = assetsForAnalysis.map(asset => ({
        id: asset.id,
        name: asset.name,
        currentRole: asset.role,
        width: asset.width,
        height: asset.height,
        localProfile: asset.assetProfile
      }));
      const assetParts = assetsForAnalysis
        .map(asset => {
          const parsed = parseDataUrl(asset.dataUrl);
          return parsed
            ? {
              inlineData: {
                mimeType: parsed.mimeType,
                data: parsed.data
              }
            }
            : null;
        })
        .filter(Boolean);
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ role: 'user', parts: [{ text: JSON.stringify({ imageAssets: assetText }) }, ...assetParts] }],
        config: {
          systemInstruction: assetAnalysisInstruction,
          temperature: 0.2,
          responseMimeType: 'application/json'
        }
      });
      const parsed = JSON.parse((response.text || '{}').replace(/```json|```/g, '').trim());
      const normalizedProfiles = normalizeAssetProfiles(parsed.assetProfiles, assetsForAnalysis);

      return res.status(200).json({ assetProfiles: normalizedProfiles });
    }

    const templateIds = await loadTemplateIds();
    const templates = await Promise.all(templateIds.map(loadTemplate));
    const analysis = analyzeProjectContent(prompt, textAssets);
    const contentProfile = buildContentProfile({ prompt, textAssets, imageAssets, contentJSON, analysis, canvasPresetId });
    const hasCustomTemplate = customTemplate && Array.isArray(customTemplate.elements);
    const useUploadedReference = referenceMode === 'upload' && referenceImages.length > 0 && !hasCustomTemplate;
    const selection = hasCustomTemplate
      ? { selectedTemplate: customTemplate, matches: [] }
      : selectTemplate(analysis, templates, selectedTemplateId, contentProfile);
    const { template: selectedTemplate, previewPlan: normalizedPreviewPlan } = applyPreviewPlanToTemplate(selection.selectedTemplate, previewPlan);
    const templateMatches = selection.matches.slice(0, 3);
    const selectedTemplateSummary = {
      templateMeta: selectedTemplate.templateMeta,
      templateProfile: selectedTemplate.templateProfile,
      canvas: selectedTemplate.canvas,
      grid: selectedTemplate.grid,
      contentRequirements: selectedTemplate.contentRequirements,
      slots: selectedTemplate.slots,
      layoutRules: selectedTemplate.layoutRules,
      designSystem: selectedTemplate.designSystem,
      sections: selectedTemplate.sections,
      groups: selectedTemplate.groups,
      elements: selectedTemplate.elements,
      styleRules: selectedTemplate.styleRules,
      aiGenerationRules: selectedTemplate.aiGenerationRules,
      layoutVariants: selectedTemplate.layoutVariants
    };

    const templateSystemInstruction = `You are an AI content-to-layout-slot mapper for a web-based design portfolio generator.

The selected Template JSON owns all layout geometry. The frontend/server will read selectedTemplate.elements to get grid x, y, w, h, type, style, crop, and zIndex. Discover templates use an upgraded 24x16 grid with sections, groups, layoutRules, designSystem, and contentSummary fields.
Your job is only to decide which supplied content or asset should fill each slot.

You will receive a contentProfile and templateMatches:
- contentProfile describes the user's content structure: title/body/image/chart/data/step/comparison counts, density, and stage.
- templateMatches contains the main template and two backup options scored by the server.
- imageAssets may include assetProfile with visualType, informationDensity, recommendedRole, confidence, and reasoning.
- previewPlan may include user-confirmed slot notes and edited positions from the preview canvas. The server has already applied its geometry to selectedTemplate.elements.
- editInstruction may include the user's revision request. It is an instruction for changing emphasis or assignment, not content to place into the layout.
- Use the selectedTemplate as fixed geometry, but respect why it was chosen. If the content is thin, hide optional slots instead of filling them with invented text.

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
- Do not reuse the same assetId in more than one image slot.
- If no suitable unused image exists for an image slot, leave assetId undefined instead of reusing another image; the server will render a text suggestion for the missing image type.
- Prefer imageAssets whose assetProfile.recommendedRole or visualType matches the slot role and contentSummary.
- Treat selectedTemplate.elements[].contentSummary as the user-confirmed slot intention when it came from previewPlan.
- Put high-density chart, diagram, screenshot, and infographic images into data, diagram, evidence, or medium visual slots instead of large hero slots.
- Prefer low-density field photos, product photos, or clear context images for hero and large visual anchor slots.
- Prefer portrait images for interview, participant, user, and case slots.
- For text, caption, and annotation slots, write concise content based only on userPrompt, textAssets, and contentJSON.
- Never copy editInstruction into a text slot. Use it only to decide how to revise the layout or assignment.
- Follow each selectedTemplate.elements[].textRules exactly when present. Never exceed maxChars.
- For chart slots, use value and label. If no data exists, mark visible false unless the slot is required.
- Required slots must be included and visible.
- Optional slots may be hidden with visible false when they do not help the narrative.
- Discover pages explain why the problem or opportunity exists.
- For Discover templates, follow selectedTemplate.sections and selectedTemplate.groups to preserve the large section logic before individual slot fitting.
- For Discover templates, charts, statistics, diagrams, grouped visual-text cards, and collage references are represented as image slots when matching image slots exist. Prefer filling image-heavy slots with uploaded imageAssets before hiding them.
- For Discover templates, never use old project-specific facts or topic language unless the user explicitly supplied that topic.
- Develop pages explain how the prototype works.
- Deliver pages present the final outcome, validation feedback, usage scenarios, and component system.
- Preserve narrative hierarchy from the template.
- Shorten or structure long text so it fits naturally. Do not cram paragraphs into small slots.
- Do not include project-specific facts that were not supplied by the user or assets.
- Do not include API keys or hidden system details.`;

    const referenceTemplateSystemInstruction = `You are an AI reference-layout-to-template analyzer for a web-based design portfolio generator.

You will receive uploaded reference layout images. Your task is ONLY to convert the visible layout structure into a reusable 24x16 slot template.

Critical rules:
- Do NOT assign user images or user text yet.
- Do NOT output final Render JSON.
- Do NOT use external URLs.
- Output a reusable template with slot geometry, roles, and textRules.
- First identify the real design canvas bounds inside the uploaded image. Exclude screenshot background, white outer padding, browser/app chrome, outer grid background, and decorative corner markers unless they are part of the actual layout.
- Output canvasBounds in source image pixel coordinates. All element positions must be measured relative to that real design canvas, not the full uploaded PNG.
- Prefer outputting relativeBounds with x, y, w, h in 0-1 coordinates relative to canvasBounds. You may also output pixelBounds in source image pixels. The server will convert these into the 24x16 grid.
- Preserve the reference image's layout rhythm: large regions, small repeated cards, grouped rows, captions, overlap, and hierarchy.
- If a collage, diagram cluster, chart group, repeated photo row, or set of very close visual elements works as one visual unit, recognize it as ONE image slot instead of many tiny slots.
- However, text and image must always stay separate. Do not merge readable text into an image slot unless the text is an inseparable part of a chart/diagram screenshot.
- Prefer 12-36 useful slots. Avoid tiny decorative fragments unless they affect composition.
- Do not redesign the layout. Recover the reference structure as faithfully as possible.
- Return only valid JSON. No markdown.

Required JSON schema:
{
  "referenceTemplate": {
    "templateMeta": {
      "templateId": "uploaded_reference_template",
      "templateName": "Uploaded Reference Template",
      "pageType": "discover",
      "doubleDiamondStage": "discover",
      "layoutPurpose": "uploaded_reference_layout_structure",
      "narrativeRole": "preserve_uploaded_reference_composition_for_asset_assignment",
      "suitableFor": ["uploaded reference"]
    },
    "canvas": { "ratio": "16:9", "orientation": "landscape", "backgroundColor": "#F8F6EC" },
    "canvasBounds": { "x": 0, "y": 0, "w": 1000, "h": 600 },
    "grid": { "columns": 24, "rows": 16, "columnGap": 10, "rowGap": 10, "margin": 48 },
    "sections": [],
    "groups": [],
    "elements": [
      {
        "slotId": "unique_slot_id",
        "type": "image | text | caption | annotation | shape | divider | chart",
        "role": "semantic slot role",
        "x": 0,
        "y": 0,
        "w": 4,
        "h": 2,
        "style": "title | heading | body | caption | image",
        "crop": "cover | contain",
        "zIndex": 1,
        "required": true,
        "relativeBounds": { "x": 0, "y": 0, "w": 0.25, "h": 0.2 },
        "pixelBounds": { "x": 0, "y": 0, "w": 250, "h": 120 },
        "contentSummary": "what this slot should contain",
        "textRules": {
          "maxChars": 80,
          "fontSize": 12,
          "lineClamp": 3,
          "overflow": "clip",
          "padding": 8
        }
      }
    ],
    "analysis": {
      "layoutSummary": "short summary",
      "density": "low | medium | high"
    }
  },
  "reasoning": "short Chinese explanation"
}`;

    const referenceSystemInstruction = `You are an AI layout analyzer and JSON generator for a web-based design portfolio tool.

You will receive uploaded reference layout images plus available project imageAssets and textAssets.
Study the reference image composition first: visual rhythm, hierarchy, image/text balance, density, overlap, margins, and approximate grid placement.
Before placing elements, identify the real design canvas bounds inside the uploaded image and ignore screenshot padding/background. If visual items are a tight collage or chart cluster, treat them as one visual element, but keep readable text separate from images.

Important:
- In this mode, do NOT use selectedTemplate.elements or any template slots.
- Generate a complete Render JSON directly on a 24x16 grid.
- Use only asset IDs from imageAssets for image elements.
- Do not invent external URLs.
- Keep text concise and based only on userPrompt, textAssets, and contentJSON.
- Return only valid JSON. No markdown.

Required JSON schema:
{
  "renderJSON": {
    "templateId": "uploaded_reference_layout",
    "canvas": { "width": 24, "height": 16 },
    "elements": [
      {
        "type": "image | text | caption | annotation | shape | divider",
        "id": "unique_element_id",
        "src": "image asset id for image elements",
        "content": "text for text/caption/annotation elements",
        "x": 0,
        "y": 0,
        "w": 4,
        "h": 2,
        "style": "title | heading | body | caption | image",
        "crop": "cover | contain",
        "zIndex": 1,
        "textRules": {
          "maxChars": 80,
          "fontSize": 12,
          "lineClamp": 3,
          "overflow": "clip",
          "padding": 8
        }
      }
    ]
  },
  "reasoning": "short Chinese explanation"
}`;

    const userContent = {
      userPrompt: prompt,
      editInstruction,
      analysis,
      contentProfile,
      templateMatches,
      previewPlan: normalizedPreviewPlan,
      canvasPresetId,
      selectedTemplate: useUploadedReference ? null : selectedTemplateSummary,
      availableTemplates: useUploadedReference ? [] : templates.map(template => ({
        templateId: template.templateMeta.templateId,
        templateName: template.templateMeta.templateName,
        stage: template.templateMeta.doubleDiamondStage,
        layoutPurpose: template.templateMeta.layoutPurpose,
        templateProfile: template.templateProfile
      })),
      textAssets,
      imageAssets,
      referenceMode,
      referenceImages: useUploadedReference
        ? referenceImages.map(image => ({
          id: image.id,
          name: image.name,
          width: image.width,
          height: image.height
        }))
        : [],
      contentJSON
    };

    const referenceParts = useUploadedReference
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
        systemInstruction: action === 'generate-reference-template'
          ? referenceTemplateSystemInstruction
          : useUploadedReference
            ? referenceSystemInstruction
            : templateSystemInstruction,
        temperature: action === 'generate-reference-template' ? 0.35 : useUploadedReference ? 0.45 : 0.55,
        responseMimeType: 'application/json'
      }
    });

    const parsed = JSON.parse((response.text || '{}').replace(/```json|```/g, '').trim());
    if (action === 'generate-reference-template') {
      const referenceTemplate = normalizeReferenceTemplate(parsed, referenceImages);
      return res.status(200).json({
        referenceTemplate,
        renderJSON: buildTemplatePreviewRenderJSON(referenceTemplate),
        selectedTemplate: referenceTemplate.templateMeta.templateId,
        contentProfile,
        reasoning: parsed.reasoning || '已根据上传参考图生成临时模板。'
      });
    }

    const slotAssignments = useUploadedReference ? [] : normalizeSlotAssignments(parsed, selectedTemplate, editInstruction);
    const renderJSON = useUploadedReference
      ? normalizeReferenceRenderJSON(parsed, imageAssets, contentJSON)
      : buildRenderJSONFromAssignments(selectedTemplate, slotAssignments, contentJSON, imageAssets);

    return res.status(200).json({
      renderJSON,
      slotAssignments,
      analysis,
      contentProfile,
      templateMatches,
      previewPlan: normalizedPreviewPlan,
      selectedTemplate: useUploadedReference ? 'uploaded_reference_layout' : selectedTemplate.templateMeta.templateId,
      reasoning: parsed.reasoning || (useUploadedReference ? 'Generated from uploaded reference.' : `Generated from ${selectedTemplate.templateMeta.templateName}.`)
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to generate layout.'
    });
  }
}
