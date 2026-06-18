import { TemplateJSON } from './templateTypes';

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
