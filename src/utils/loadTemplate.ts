import { TemplateJSON, TemplateManifest } from './templateTypes';

const DEFAULT_TEMPLATE_IDS = [
  'discover_16x9.context_mapping',
  'discover_1800x768.long_medical_strip',
  'define_16x9.concept_sketch_long',
  'develop_16x9.prototype_demo',
  'deliver_16x9.final_outcome'
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
  return loadTemplates(templateIds);
}
