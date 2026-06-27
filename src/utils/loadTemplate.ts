import { TemplateJSON, TemplateManifest } from './templateTypes';

const DEFAULT_TEMPLATE_IDS = [
  'discover_context_mapping_16x9',
  'discover_long_medical_strip',
  'define_concept_sketch_long_16x9',
  'develop_prototype_demo_16x9',
  'deliver_final_outcome_16x9'
];

export async function loadTemplate(templateId: string): Promise<TemplateJSON> {
  const response = await fetch(`/templates/${templateId}.json`);

  if (!response.ok) {
    throw new Error(`Template not found: ${templateId}`);
  }

  return response.json();
}

export async function loadTemplates(templateIds: string[]): Promise<TemplateJSON[]> {
  return Promise.all(templateIds.map(loadTemplate));
}

export async function loadTemplateManifest(): Promise<TemplateManifest> {
  const response = await fetch('/templates/template-manifest.json');

  if (!response.ok) {
    return {
      version: 1,
      templates: DEFAULT_TEMPLATE_IDS.map(templateId => ({
        templateId,
        templateName: templateId,
        stage: templateId.split('_')[0]
      }))
    };
  }

  return response.json();
}

export async function loadAllTemplates(): Promise<TemplateJSON[]> {
  const manifest = await loadTemplateManifest();
  const templateIds = manifest.templates.map(template => template.templateId);
  return loadTemplates(templateIds.length ? templateIds : DEFAULT_TEMPLATE_IDS);
}
