import { AnalysisResult, ContentJSON } from './templateTypes';

const keywordIncludes = (text: string, keywords: string[]) => keywords.some(keyword => text.includes(keyword));

export function analyzeProjectContent(userInput: string | ContentJSON): AnalysisResult {
  const rawText = typeof userInput === 'string'
    ? userInput
    : JSON.stringify(userInput.content || {});
  const text = rawText.toLowerCase();

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
  ].filter(Boolean) as string[];

  return {
    detectedStage,
    detectedPageType: detectedStage === 'deliver'
      ? 'final_outcome_and_validation_summary'
      : detectedStage === 'develop'
        ? 'prototype_function_testing'
        : 'context_research_overview',
    contentTypesFound,
    missingContent: [
      !contentTypesFound.includes('research_question') && detectedStage === 'discover' ? 'research_question' : '',
      !contentTypesFound.includes('source_data') ? 'source_data' : '',
      !contentTypesFound.includes('prototype_description') && detectedStage === 'develop' ? 'prototype_description' : ''
    ].filter(Boolean)
  };
}
