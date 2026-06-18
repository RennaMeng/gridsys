import { AnalysisResult, TemplateJSON, TemplateSelection } from './templateTypes';

export function selectTemplate(
  analysisResult: AnalysisResult,
  availableTemplates: TemplateJSON[]
): TemplateSelection {
  const stageMatch = availableTemplates.find(template => (
    template.templateMeta.doubleDiamondStage === analysisResult.detectedStage ||
    template.templateMeta.pageType === analysisResult.detectedStage
  ));

  const selected = stageMatch || availableTemplates[0];

  return {
    selectedTemplate: selected?.templateMeta.templateId || '',
    reason: selected
      ? `Matched ${analysisResult.detectedStage} stage with ${analysisResult.contentTypesFound.join(', ') || 'general content'}.`
      : 'No template available.'
  };
}
