import type { TemplateDefinition } from '../contracts/template-registry.types.js';

export function formatTemplateList(templates: TemplateDefinition[]): string {
  const entries = templates.map(
    (template) =>
      `${template.id}  ${template.version}\n  ${template.name}\n  ${template.description}`,
  );

  return `Templates disponíveis:\n\n${entries.join('\n\n')}`;
}
