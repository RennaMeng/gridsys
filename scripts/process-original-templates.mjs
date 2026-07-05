import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const sourceDir = path.join(rootDir, '排版json原文件');
const outputDir = path.join(rootDir, 'public', 'templates');
const manifestPath = path.join(outputDir, 'template-manifest.json');

const existingTemplates = [
  'discover_16x9.context_mapping',
  'develop_16x9.prototype_demo',
  'deliver_16x9.final_outcome'
];

const stageFromName = (fileName, raw) => {
  const lower = fileName.toLowerCase();
  if (lower.includes('medical')) return 'discover';
  if (lower.includes('define')) return 'define';
  if (lower.includes('concept')) return 'define';
  if (lower.includes('develop')) return 'develop';
  if (lower.includes('deliver')) return 'deliver';
  if (lower.includes('discover')) return 'discover';
  const recommended = raw?.analysis?.recommendedUse || raw?.templateMeta?.doubleDiamondStage || raw?.templateMeta?.pageType;
  if (recommended && ['discover', 'define', 'develop', 'deliver'].includes(String(recommended).toLowerCase())) {
    return String(recommended).toLowerCase();
  }
  return 'discover';
};

const slugify = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

const inferDensity = (elements) => {
  if (elements.length >= 24) return 'high';
  if (elements.length >= 12) return 'medium';
  return 'low';
};

const roleToStyle = (element, index) => {
  if (element.style) return element.style;
  if (element.role === 'title') return index < 3 ? 'title' : 'heading';
  if (element.type === 'caption') return 'caption';
  if (element.type === 'image') return 'image';
  return 'body';
};

const textRulesFor = (element, style) => {
  if (element.type === 'image' || element.type === 'divider' || element.type === 'shape') return undefined;
  const base = {
    title: { maxChars: 48, fontSize: 24, lineClamp: 2, overflow: 'clip', padding: 8 },
    heading: { maxChars: 42, fontSize: 15, lineClamp: 2, overflow: 'clip', padding: 6 },
    body: { maxChars: 170, fontSize: 11, lineClamp: 6, overflow: 'clip', padding: 8 },
    caption: { maxChars: 42, fontSize: 8, lineClamp: 2, overflow: 'clip', padding: 4 },
    annotation: { maxChars: 80, fontSize: 10, lineClamp: 3, overflow: 'clip', padding: 6 }
  };
  return base[style] || base[element.role] || base.body;
};

const GENERIC_SLOT_SEQUENCE = [
  ['hero_problem_context_image', 'Full-height hero/context image that anchors the page theme without naming a specific project.'],
  ['hero_concept_title', 'Large concept or problem title overlaid on the hero image.'],
  ['hero_critical_annotation', 'Short critical annotation that frames the key tension or design opportunity.'],
  ['header_problem_definition', 'Heading for the problem or concept definition block.'],
  ['body_definition_context', 'Concise explanation of distribution, user context, effects, or why the issue matters.'],
  ['body_evidence_and_implications', 'Evidence-led body text summarizing value, risk, constraints, or implications.'],
  ['header_solution_application', 'Heading for potential solution applications or design branches.'],
  ['diagram_solution_applications', 'Diagram or sketch image showing possible applications, use scenarios, or solution branches.'],
  ['header_process_structure', 'Heading for source-to-use process structure or stakeholder chain.'],
  ['image_process_stage_a', 'Small image representing the first process, source, or stakeholder stage.'],
  ['caption_process_stage_a', 'Caption for the first process or stakeholder stage.'],
  ['image_process_stage_b', 'Small image representing the second process, making, or transformation stage.'],
  ['caption_process_stage_b', 'Caption for the second process or transformation stage.'],
  ['image_process_stage_c', 'Small image representing the third distribution, use, or service stage.'],
  ['caption_process_stage_c', 'Caption for the third distribution, use, or service stage.'],
  ['text_material_property_banner', 'Short banner insight summarizing a key material, behavior, or opportunity property.'],
  ['header_material_experiment', 'Heading for experiment, prototype sketch, or material exploration sequence.'],
  ['image_experiment_stage_1', 'Image of the initial material, prototype part, or baseline state.'],
  ['caption_experiment_stage_1', 'Label for the initial material, prototype part, or baseline state.'],
  ['image_experiment_stage_2', 'Image of the first transformation, rough prototype, or exploration state.'],
  ['caption_experiment_stage_2', 'Label for the first transformation or exploration state.'],
  ['image_experiment_stage_3', 'Image of the refined transformation, softened prototype, or improved state.'],
  ['caption_experiment_stage_3', 'Label for the refined transformation or improved state.'],
  ['image_experiment_combination', 'Larger image showing combined forms, solution sketches, parts, or final experiment outcome.']
];

const CONCEPT_SLOT_SEQUENCE = [
  ['concept_section_title', 'Large title for the conceptual foundation section.'],
  ['relationship_subtitle', 'Subtitle for the relationship or system logic diagram.'],
  ['relationship_diagram', 'Diagram image explaining relationships between users, materials, functions, or system parts.'],
  ['interaction_principle_subtitle', 'Subtitle for the interaction principle section.'],
  ['interaction_principle_blocks', 'Compact text block explaining key interaction principles or design mechanisms.'],
  ['system_mechanism_subtitle', 'Subtitle for the circulation, system, or mechanism diagram.'],
  ['system_mechanism_diagram', 'Diagram image showing a system cycle, process loop, or mechanism structure.'],
  ['objective_annotation', 'Short objective note explaining the intended design outcome.'],
  ['sketch_section_title', 'Large title for the design sketch section.'],
  ['step_1_title', 'Title for the first design sketch or process step.'],
  ['step_1_diagram', 'Diagram or sketch image for the first step.'],
  ['step_3_title', 'Title for a branching or parallel design sketch step.'],
  ['step_3_diagram', 'Diagram or sketch image for the branching step.'],
  ['step_2_title', 'Title for the second major design sketch or process step.'],
  ['step_2_diagram', 'Large diagram or sketch image for the second major step.'],
  ['step_final_title', 'Title for the final system, overall scenario, or summary step.'],
  ['step_final_diagram', 'Final diagram or sketch image summarizing the proposed design system.']
];

const MEDICAL_SLOT_SEQUENCE = [
  ['inspiration_title', 'Main heading for the inspiration or project origin section.'],
  ['inspiration_context_image', 'Small context image introducing the origin story, user situation, or observed scene.'],
  ['inspiration_body_text', 'Short origin narrative explaining why this topic matters.'],
  ['background_title', 'Heading for background research.'],
  ['background_summary', 'Short background paragraph describing the scale, urgency, or context.'],
  ['background_map_visual', 'Map, contextual diagram, or large data visualization background.'],
  ['background_key_data_a', 'Large key data point or highlighted statistic.'],
  ['background_key_data_b', 'Second highlighted statistic or prevalence indicator.'],
  ['background_key_data_c', 'Supporting number or data label.'],
  ['background_trend_chart', 'Chart or data visualization showing trend, distribution, or age/group pattern.'],
  ['research_title', 'Main heading for research section.'],
  ['research_intro_text', 'Short introduction to research findings.'],
  ['research_distribution_visual', 'Diagram or chart visualizing distribution, segmentation, or categories.'],
  ['research_distribution_notes', 'Annotations explaining the distribution diagram.'],
  ['research_key_percentage', 'Large highlighted percentage or data callout.'],
  ['research_bar_chart', 'Compact chart or comparison visualization.'],
  ['research_method_text', 'Short text explaining technology, method, or mechanism.'],
  ['challenge_title', 'Heading for challenge, pain point, or opportunity section.'],
  ['challenge_system_diagram', 'Human, system, service, or mechanism diagram used as a background visual.'],
  ['challenge_diagram_annotations', 'Labels and callouts attached to the challenge diagram.'],
  ['challenge_list_text', 'List of pain points, constraints, or user challenges.'],
  ['research_conclusion_card', 'Highlighted conclusion or opportunity card.'],
  ['interview_title', 'Main heading for interview or field research section.'],
  ['interview_intro_text', 'Short introduction to interview context.'],
  ['interview_question', 'Interview question or research prompt.'],
  ['participant_1_image', 'Portrait or field image for the first participant/story.'],
  ['participant_1_details', 'Details or profile text for the first participant/story.'],
  ['participant_1_quote', 'Quote or insight from the first participant/story.'],
  ['participant_1_avatar', 'Small portrait/avatar image for the first quote.'],
  ['participant_2_quote', 'Quote or insight from the second participant/story.'],
  ['participant_2_avatar', 'Small portrait/avatar image for the second quote.'],
  ['participant_3_quote', 'Quote or insight from the third participant/story.'],
  ['participant_3_avatar', 'Small portrait/avatar image for the third quote.'],
  ['conclusion_title', 'Heading for final discover-stage conclusion.'],
  ['conclusion_body_text', 'Final paragraph summarizing research insight and opportunity.']
];

const genericSlotFor = (element, index, variant = 'bigImage') => {
  const mapped = variant === 'medical' ? MEDICAL_SLOT_SEQUENCE[index] : variant === 'concept' ? CONCEPT_SLOT_SEQUENCE[index] : GENERIC_SLOT_SEQUENCE[index];
  if (mapped) return mapped;
  const typePrefix = element.type === 'image' ? 'image' : element.type === 'caption' ? 'caption' : 'text';
  const role = slugify(element.role || element.type || 'slot');
  return [
    `${typePrefix}_${role}_${index + 1}`,
    element.contentSummary || `Generic ${element.role || element.type} slot for this layout.`
  ];
};

const buildTemplateProfile = (stage, elements, sections, variant = 'bigImage') => {
  const textSlotCount = elements.filter(element => element.type !== 'image' && element.type !== 'divider' && element.type !== 'shape').length;
  const imageSlotCount = elements.filter(element => element.type === 'image').length;
  const chartSlotCount = elements.filter(element => element.type === 'chart').length;
  const stepCount = elements.filter(element => /process|stage|experiment|step|sketch/i.test(`${element.slotId} ${element.role} ${element.contentSummary}`)).length;

  return {
    stage,
    pageIntent: stage === 'discover' && variant === 'medical'
      ? ['long-format research report', 'background evidence', 'data visualization', 'interview insights', 'field research']
      : stage === 'define' && variant === 'concept'
      ? ['design concept', 'relationship diagram', 'interaction principle', 'system mechanism', 'design sketch sequence']
      : stage === 'define'
        ? ['solution sketch', 'concept definition', 'material experiment', 'process structure', 'application mapping']
      : stage === 'discover'
        ? ['background research', 'problem discovery', 'context definition', 'evidence mapping', 'material or behavior insight']
      : ['portfolio layout', 'visual explanation'],
    canvas: {
      ratio: variant === 'medical' ? '1800:768' : '16:9',
      orientation: 'landscape'
    },
    structure: {
      sectionCount: sections.length || 4,
      textSlotCount,
      imageSlotCount,
      chartSlotCount,
      dataPointCount: elements.filter(element => /data|stat|number|evidence/i.test(`${element.role} ${element.contentSummary}`)).length,
      stepCount,
      comparisonCount: elements.filter(element => /compare|versus|before|after/i.test(`${element.role} ${element.contentSummary}`)).length,
      density: inferDensity(elements),
      hasHeroImage: elements.some(element => element.type === 'image' && /hero/i.test(element.slotId)),
      hasBigImage: elements.some(element => element.type === 'image' && element.w >= 8 && element.h >= 8),
      hasProcessFlow: stepCount >= 4,
      hasSketchArea: stage === 'define'
    },
    strengths: [
      variant === 'medical' ? 'three-column long-format research report structure' : variant === 'concept' ? 'clear two-column concept and sketch structure' : 'strong full-height visual anchor',
      stage === 'discover'
        ? variant === 'medical'
          ? 'supports dense background, research, and interview evidence'
          : 'supports background research and context explanation'
        : variant === 'concept'
          ? 'supports relationship diagrams and interaction principles'
          : 'supports concept definition and evidence notes',
      stage === 'discover'
        ? variant === 'medical'
          ? 'supports charts, diagrams, and participant evidence as visual slots'
          : 'supports evidence diagrams or context maps as images'
        : variant === 'concept'
          ? 'supports step-based design sketch diagrams'
          : 'supports solution/application diagram as image',
      stage === 'discover' ? 'supports source-to-impact or behavior sequence' : 'supports process or experiment sequence'
    ],
    risks: [
      'many small text slots require concise copy',
      'best results need enough visual assets for process and experiment slots'
    ],
    bestFor: [
      stage === 'discover' ? 'discover pages focused on background research' : 'define pages focused on solution sketches',
      stage === 'discover'
        ? variant === 'medical'
          ? 'long strip canvases with dense research evidence'
          : 'problem context overview with one dominant image'
        : variant === 'concept'
          ? 'design concept pages with diagrams and step sketches'
          : 'concept exploration with one dominant image',
      stage === 'discover'
        ? variant === 'medical'
          ? 'data-heavy reports with interviews or user narratives'
          : 'evidence mapping and behavior insight'
        : variant === 'concept'
          ? 'relationship, mechanism, and interaction principle explanation'
          : 'material experiment or prototype form studies',
      'process-chain explanation'
    ],
    avoidFor: [
      'photo-only moodboards with almost no text',
      'final outcome pages that need validation feedback',
      'content with very long narrative paragraphs'
    ]
  };
};

const buildLongBigImageTemplate = (raw, sourceFile, stage) => {
  const sourceElements = Array.isArray(raw.elements) ? raw.elements : [];
  const lowerSource = sourceFile.toLowerCase();
  const variant = lowerSource.includes('medical') ? 'medical' : lowerSource.includes('concept') ? 'concept' : 'bigImage';
  const elements = sourceElements.map((element, index) => {
    const [slotId, contentSummary] = genericSlotFor(element, index, variant);
    const style = roleToStyle(element, index);
    const normalizedType = variant === 'medical' && element.type === 'shape'
      ? 'image'
      : element.type === 'caption'
        ? 'caption'
        : element.type === 'image'
          ? 'image'
          : 'text';
    const normalized = {
      slotId,
      type: normalizedType,
      role: element.role || (element.type === 'image' ? 'supporting_image' : 'body_text'),
      x: element.x,
      y: element.y,
      w: element.w,
      h: element.h,
      style,
      zIndex: element.zIndex || index + 1,
      required: index < 8 || /hero|title|definition|application|experiment/.test(slotId),
      contentSummary
    };

    if (normalized.type === 'image') {
      normalized.crop = element.crop === 'contain' ? 'contain' : 'cover';
    } else {
      normalized.textRules = textRulesFor(normalized, style);
    }

    return normalized;
  });

  const bigImageSections = [
    {
      id: 'hero_context',
      label: 'Hero Context',
      purpose: 'Use one dominant visual to introduce the design context or core tension.',
      slots: ['hero_problem_context_image', 'hero_concept_title', 'hero_critical_annotation']
    },
    {
      id: 'problem_definition',
      label: 'Problem Definition',
      purpose: 'Summarize the issue, evidence, constraints, and implications without project-specific wording.',
      slots: ['header_problem_definition', 'body_definition_context', 'body_evidence_and_implications']
    },
    {
      id: 'solution_application',
      label: 'Solution Application',
      purpose: 'Show the proposed application directions, process chain, or service structure.',
      slots: [
        'header_solution_application',
        'diagram_solution_applications',
        'header_process_structure',
        'image_process_stage_a',
        'caption_process_stage_a',
        'image_process_stage_b',
        'caption_process_stage_b',
        'image_process_stage_c',
        'caption_process_stage_c'
      ]
    },
    {
      id: 'material_experiment',
      label: 'Material Experiment',
      purpose: 'Present solution sketches, physical experiments, form iterations, or prototype states.',
      slots: [
        'text_material_property_banner',
        'header_material_experiment',
        'image_experiment_stage_1',
        'caption_experiment_stage_1',
        'image_experiment_stage_2',
        'caption_experiment_stage_2',
        'image_experiment_stage_3',
        'caption_experiment_stage_3',
        'image_experiment_combination'
      ]
    }
  ];
  const conceptSections = [
    {
      id: 'design_concept',
      label: 'Design Concept',
      purpose: 'Explain the conceptual foundation, relationships, principles, and system mechanism.',
      slots: [
        'concept_section_title',
        'relationship_subtitle',
        'relationship_diagram',
        'interaction_principle_subtitle',
        'interaction_principle_blocks',
        'system_mechanism_subtitle',
        'system_mechanism_diagram',
        'objective_annotation'
      ]
    },
    {
      id: 'design_sketch',
      label: 'Design Sketch',
      purpose: 'Show the proposed design through sequential sketches, diagrams, or process steps.',
      slots: [
        'sketch_section_title',
        'step_1_title',
        'step_1_diagram',
        'step_3_title',
        'step_3_diagram',
        'step_2_title',
        'step_2_diagram',
        'step_final_title',
        'step_final_diagram'
      ]
    }
  ];
  const medicalSections = [
    {
      id: 'inspiration_background',
      label: 'Inspiration & Background',
      purpose: 'Introduce the research origin, background evidence, and first layer of data visualization.',
      slots: [
        'inspiration_title',
        'inspiration_context_image',
        'inspiration_body_text',
        'background_title',
        'background_summary',
        'background_map_visual',
        'background_key_data_a',
        'background_key_data_b',
        'background_key_data_c',
        'background_trend_chart'
      ]
    },
    {
      id: 'research_challenge',
      label: 'Research & Challenge',
      purpose: 'Present research findings, system diagrams, key data points, and challenge synthesis.',
      slots: [
        'research_title',
        'research_intro_text',
        'research_distribution_visual',
        'research_distribution_notes',
        'research_key_percentage',
        'research_bar_chart',
        'research_method_text',
        'challenge_title',
        'challenge_system_diagram',
        'challenge_diagram_annotations',
        'challenge_list_text',
        'research_conclusion_card'
      ]
    },
    {
      id: 'interview_insights',
      label: 'Interview Insights',
      purpose: 'Show field interviews, participant stories, quotes, avatars, and final research conclusion.',
      slots: [
        'interview_title',
        'interview_intro_text',
        'interview_question',
        'participant_1_image',
        'participant_1_details',
        'participant_1_quote',
        'participant_1_avatar',
        'participant_2_quote',
        'participant_2_avatar',
        'participant_3_quote',
        'participant_3_avatar',
        'conclusion_title',
        'conclusion_body_text'
      ]
    }
  ];
  const sections = variant === 'medical' ? medicalSections : variant === 'concept' ? conceptSections : bigImageSections;

  const templateId = stage === 'discover'
    ? variant === 'medical'
      ? 'discover_1800x768.long_medical_strip'
      : 'discover_16x9.long_big_image'
    : variant === 'concept'
      ? 'define_16x9.concept_sketch_long'
      : 'define_16x9.solution_sketch_long';
  const templateProfile = buildTemplateProfile(stage, elements, sections, variant);
  const templateName = stage === 'discover'
    ? variant === 'medical'
      ? 'Discover Long Medical Strip'
      : 'Discover Long Big Image Board'
    : variant === 'concept'
      ? 'Define Concept Sketch Long Board'
      : 'Define Solution Sketch Long Board';

  return {
    templateMeta: {
      templateId,
      templateName,
      pageType: stage,
      doubleDiamondStage: stage,
      layoutPurpose: stage === 'discover'
        ? variant === 'medical'
          ? 'long_strip_background_research_data_visualization_and_interview_insights'
          : 'background_research_context_mapping_and_evidence_sequence'
        : variant === 'concept'
          ? 'design_concept_relationship_diagram_and_solution_sketch_sequence'
        : 'solution_sketch_material_experiment_and_process_mapping',
      narrativeRole: stage === 'discover'
        ? variant === 'medical'
          ? 'turn_dense_research_material_into_background_evidence_and_interview_logic'
          : 'turn_research_context_into_problem_background_and_evidence_logic'
        : variant === 'concept'
          ? 'turn_problem_framing_into_design_concept_and_step_based_sketch_logic'
        : 'turn_problem_definition_into_solution_direction_and_form_exploration',
      suitableFor: stage === 'discover'
        ? variant === 'medical'
          ? ['discover page', 'strip canvas', 'background research', 'data visualization', 'interview insights', 'field research']
          : ['discover page', 'background research', 'context mapping', 'evidence diagram', 'process mapping']
        : variant === 'concept'
          ? ['define page', 'design concept', 'relationship diagram', 'interaction principle', 'design sketch sequence']
        : ['define page', 'solution sketch', 'material experiment', 'application diagram', 'process mapping'],
      source: sourceFile
    },
    templateProfile,
    canvas: {
      ratio: variant === 'medical' ? '1800:768' : '16:9',
      backgroundColor: raw.canvas?.backgroundColor || '#F8F6EC'
    },
    grid: {
      type: 'strict_grid',
      columns: 24,
      rows: 16,
      columnGap: 0,
      rowGap: 0,
      margin: raw.grid?.margin || 48,
      layoutDensity: templateProfile.structure.density,
      alignment: 'modular',
      coordinateSystem: '24x16_grid'
    },
    layoutRules: {
      density: templateProfile.structure.density,
      alignToGrid: true,
      preserveTemplateGeometry: true,
      avoidProjectSpecificCopy: true,
      preferredReadingOrder: 'left_to_right_with_right_column_iteration_sequence',
      imageStrategy: 'Use uploaded sketches, diagrams, process photos, and prototype images. Treat charts and diagrams as image assets when needed.'
    },
    designSystem: {
      summary: stage === 'discover'
        ? variant === 'medical'
          ? 'High-density long strip research board with three vertical evidence columns for inspiration, research, and interview insights.'
          : 'High-density research board with a dominant left hero image, middle context explanation, and right-side evidence or process sequence.'
        : variant === 'concept'
          ? 'High-density concept board with left-side conceptual logic and right-side sequential design sketches.'
        : 'High-density portfolio board with a dominant left hero image, middle definition text, and right-side solution sketch or experiment sequence.',
      typography: 'bold condensed headings, compact body text, small captions',
      colorLogic: 'neutral board with accent blocks or banners reserved for key insight'
    },
    sections,
    groups: raw.groups || [],
    elements,
    contentRequirements: {
      required: elements.filter(element => element.required).map(element => element.slotId),
      optional: elements.filter(element => !element.required).map(element => element.slotId)
    },
    slots: {
      textSlots: elements
        .filter(element => element.type !== 'image' && element.type !== 'divider' && element.type !== 'shape')
        .map(element => ({ id: element.slotId, role: element.role, required: element.required })),
      imageSlots: elements
        .filter(element => element.type === 'image')
        .map(element => ({ id: element.slotId, role: element.role, required: element.required, cropStyle: element.crop || 'cover' }))
    },
    styleRules: {
      visualDensity: templateProfile.structure.density,
      layoutStyle: stage === 'discover'
        ? variant === 'medical'
          ? 'discover_1800x768.long_medical_strip'
          : 'discover_long_big_image_board'
        : variant === 'concept'
          ? 'define_concept_sketch_board'
          : 'define_solution_sketch_board',
      textTone: 'abstract project logic, no concrete source-project nouns',
      preserveStrongLeftHero: true
    },
    aiGenerationRules: {
      mainLogic: stage === 'discover'
        ? variant === 'medical'
          ? 'Use only for discover-stage long strip canvases. Assign dense research text, data visualizations, diagrams, and interview material into fixed slots.'
          : 'Use contentProfile to decide whether this template fits a discover-page research context. Then assign assets to fixed slots only.'
        : variant === 'concept'
          ? 'Use contentProfile to decide whether this template fits a define-page concept and sketch sequence. Then assign assets to fixed slots only.'
        : 'Use contentProfile to decide whether this template fits a define-page solution sketch. Then assign assets to fixed slots only.',
      preserveTemplateGeometry: true,
      prioritizeUploadedImages: true,
      treatDiagramsAndChartsAsImages: true,
      abstractSourceTopic: true,
      avoid: [
        'using source JSON project nouns',
        'inventing coordinates',
        'turning small captions into long paragraphs',
        'using this template for final deliverable validation pages'
      ]
    },
    layoutVariants: [
      {
        variantId: stage === 'discover'
          ? variant === 'medical'
            ? 'discover_1800x768.long_medical_strip'
            : 'discover_long_big_image_board'
          : variant === 'concept'
            ? 'define_concept_sketch_long_board'
            : 'define_solution_sketch_long_board',
        layoutLogic: stage === 'discover'
          ? variant === 'medical'
            ? 'three_column_long_strip_inspiration_research_interview_report'
            : 'dominant_context_image_plus_research_definition_plus_evidence_and_process_sequence'
          : variant === 'concept'
            ? 'left_concept_relationships_plus_right_step_based_design_sketches'
          : 'dominant_context_image_plus_definition_plus_solution_application_and_experiment_sequence'
      }
    ]
  };
};

const buildManifest = async (processedTemplates) => {
  const baseItems = [];
  for (const templateId of existingTemplates) {
    try {
      const template = JSON.parse(await readFile(path.join(outputDir, `${templateId}.json`), 'utf8'));
      baseItems.push({
        templateId,
        stage: template.templateMeta?.doubleDiamondStage || template.templateMeta?.pageType || templateId.split('_')[0],
        templateName: template.templateMeta?.templateName || templateId,
        profile: template.templateProfile
      });
    } catch {
      baseItems.push({
        templateId,
        stage: templateId.split('_')[0],
        templateName: templateId
      });
    }
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    templates: [
      baseItems.find(item => item.templateId === 'discover_16x9.context_mapping'),
      ...processedTemplates.map(template => ({
        templateId: template.templateMeta.templateId,
        stage: template.templateMeta.doubleDiamondStage,
        templateName: template.templateMeta.templateName,
        source: template.templateMeta.source,
        profile: template.templateProfile
      })),
      baseItems.find(item => item.templateId === 'develop_16x9.prototype_demo'),
      baseItems.find(item => item.templateId === 'deliver_16x9.final_outcome')
    ].filter(Boolean)
  };
};

const main = async () => {
  await mkdir(outputDir, { recursive: true });
  const files = await readdir(sourceDir);
  const processedTemplates = [];
  const skipped = [];

  for (const fileName of files.filter(file => file.endsWith('.json'))) {
    if (fileName === 'discover(longsize,bigimage).json') {
      skipped.push(`${fileName}: replaced by long_medical.json`);
      continue;
    }

    const filePath = path.join(sourceDir, fileName);
    const sourceText = await readFile(filePath, 'utf8');
    if (!sourceText.trim()) {
      skipped.push(`${fileName}: empty file`);
      continue;
    }

    let raw;
    try {
      raw = JSON.parse(sourceText);
    } catch (error) {
      skipped.push(`${fileName}: invalid JSON (${error.message})`);
      continue;
    }

    const stage = stageFromName(fileName, raw);
    if (!['discover', 'define'].includes(stage)) {
      skipped.push(`${fileName}: no processor yet for stage "${stage}"`);
      continue;
    }

    const template = buildLongBigImageTemplate(raw, fileName, stage);
    await writeFile(path.join(outputDir, `${template.templateMeta.templateId}.json`), `${JSON.stringify(template, null, 2)}\n`);
    processedTemplates.push(template);
  }

  const manifest = await buildManifest(processedTemplates);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(JSON.stringify({
    processed: processedTemplates.map(template => template.templateMeta.templateId),
    skipped
  }, null, 2));
};

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
