import { ContentJSON, FilledTemplate, TemplateJSON } from './templateTypes';

export function fillTemplateSlots(template: TemplateJSON, contentJSON: ContentJSON): FilledTemplate {
  const content = contentJSON.content || {};
  const textSlots = template.slots.textSlots || [];
  const imageSlots = template.slots.imageSlots || [];
  const allSlots = [...textSlots, ...imageSlots, ...(template.slots.dataSlots || []), ...(template.slots.captionSlots || [])];
  const filledContent: Record<string, unknown> = {};

  allSlots.forEach(slot => {
    const directValue = content[slot.id];
    const roleValue = content[slot.role];
    if (directValue !== undefined) {
      filledContent[slot.id] = directValue;
    } else if (roleValue !== undefined) {
      filledContent[slot.id] = roleValue;
    }
  });

  const missingRequiredSlots = [
    ...textSlots,
    ...imageSlots
  ]
    .filter(slot => slot.required && filledContent[slot.id] === undefined)
    .map(slot => slot.id);

  return {
    templateId: template.templateMeta.templateId,
    filledContent,
    missingRequiredSlots
  };
}
