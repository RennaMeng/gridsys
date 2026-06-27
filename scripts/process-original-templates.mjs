import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const sourceDir = path.join(rootDir, '排版json原文件');
const outputDir = path.join(rootDir, 'public', 'templates');
const manifestPath = path.join(outputDir, 'template-manifest.json');

const existingTemplates = [
  'discover_context_mapping_16x9',
  'develop_prototype_demo_16x9',
  'deliver_final_outcome_16x9'
];

const stageFromName = (fileName, raw) => {
  const lower = fileName.toLowerCase();
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

const genericSlotFor = (element, index, variant = 'bigImage') => {
  const mapped = variant === 'concept' ? CONCEPT_SLOT_SEQUENCE[index] : GENERIC_SLOT_SEQUENCE[index];
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
    pageIntent: stage === 'define' && variant === 'concept'
      ? ['design concept', 'relationship diagram', 'interaction principle', 'system mechanism', 'design sketch sequence']
      : stage === 'define'
        ? ['solution sketch', 'concept definition', 'material experiment', 'process structure', 'application mapping']
      : stage === 'discover'
        ? ['background research', 'problem discovery', 'context definition', 'evidence mapping', 'material or behavior insight']
      : ['portfolio layout', 'visual explanation'],
    canvas: {
      ratio: '16:9',
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
      variant === 'concept' ? 'clear two-column concept and sketch structure' : 'strong full-height visual anchor',
      stage === 'discover'
        ? 'supports background research and context explanation'
        : variant === 'concept'
          ? 'supports relationship diagrams and interaction principles'
          : 'supports concept definition and evidence notes',
      stage === 'discover'
        ? 'supports evidence diagrams or context maps as images'
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
        ? 'problem context overview with one dominant image'
        : variant === 'concept'
          ? 'design concept pages with diagrams and step sketches'
          : 'concept exploration with one dominant image',
      stage === 'discover'
        ? 'evidence mapping and behavior insight'
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
  const variant = sourceFile.toLowerCase().includes('concept') ? 'concept' : 'bigImage';
  const elements = sourceElements.map((element, index) => {
    const [slotId, contentSummary] = genericSlotFor(element, index, variant);
    const style = roleToStyle(element, index);
    const normalized = {
      slotId,
      type: element.type === 'caption' ? 'caption' : element.type === 'image' ? 'image' : 'text',
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
  const sections = variant === 'concept' ? conceptSections : bigImageSections;

  const templateId = stage === 'discover'
    ? 'discover_long_big_image_16x9'
    : variant === 'concept'
      ? 'define_concept_sketch_long_16x9'
      : 'define_solution_sketch_long_16x9';
  const templateProfile = buildTemplateProfile(stage, elements, sections, variant);
  const templateName = stage === 'discover'
    ? 'Discover Long Big Image Board'
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
        ? 'background_research_context_mapping_and_evidence_sequence'
        : variant === 'concept'
          ? 'design_concept_relationship_diagram_and_solution_sketch_sequence'
        : 'solution_sketch_material_experiment_and_process_mapping',
      narrativeRole: stage === 'discover'
        ? 'turn_research_context_into_problem_background_and_evidence_logic'
        : variant === 'concept'
          ? 'turn_problem_framing_into_design_concept_and_step_based_sketch_logic'
        : 'turn_problem_definition_into_solution_direction_and_form_exploration',
      suitableFor: stage === 'discover'
        ? ['discover page', 'background research', 'context mapping', 'evidence diagram', 'process mapping']
        : variant === 'concept'
          ? ['define page', 'design concept', 'relationship diagram', 'interaction principle', 'design sketch sequence']
        : ['define page', 'solution sketch', 'material experiment', 'application diagram', 'process mapping'],
      source: sourceFile
    },
    templateProfile,
    canvas: {
      ratio: '16:9',
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
        ? 'High-density research board with a dominant left hero image, middle context explanation, and right-side evidence or process sequence.'
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
        ? 'discover_long_big_image_board'
        : variant === 'concept'
          ? 'define_concept_sketch_board'
          : 'define_solution_sketch_board',
      textTone: 'abstract project logic, no concrete source-project nouns',
      preserveStrongLeftHero: true
    },
    aiGenerationRules: {
      mainLogic: stage === 'discover'
        ? 'Use contentProfile to decide whether this template fits a discover-page research context. Then assign assets to fixed slots only.'
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
          ? 'discover_long_big_image_board'
          : variant === 'concept'
            ? 'define_concept_sketch_long_board'
            : 'define_solution_sketch_long_board',
        layoutLogic: stage === 'discover'
          ? 'dominant_context_image_plus_research_definition_plus_evidence_and_process_sequence'
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
      baseItems.find(item => item.templateId === 'discover_context_mapping_16x9'),
      ...processedTemplates.map(template => ({
        templateId: template.templateMeta.templateId,
        stage: template.templateMeta.doubleDiamondStage,
        templateName: template.templateMeta.templateName,
        source: template.templateMeta.source,
        profile: template.templateProfile
      })),
      baseItems.find(item => item.templateId === 'develop_prototype_demo_16x9'),
      baseItems.find(item => item.templateId === 'deliver_final_outcome_16x9')
    ].filter(Boolean)
  };
};

const main = async () => {
  await mkdir(outputDir, { recursive: true });
  const files = await readdir(sourceDir);
  const processedTemplates = [];
  const skipped = [];

  for (const fileName of files.filter(file => file.endsWith('.json'))) {
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
