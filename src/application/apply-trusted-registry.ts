import type { Prompt } from '../contracts/cli-ports.js';
import type { TemplateDefinition } from '../contracts/template-registry.types.js';
import type {
  TemplateRegistryV2,
  TemplateVersion,
} from '../contracts/template-registry-v2.types.js';
import {
  type CreateProjectDependencies,
  type CreateProjectOptions,
  type CreateProjectResult,
  createProjectFromTemplate,
} from './create-project.js';
import {
  parseTemplateSelector,
  resolveTemplateVersion,
} from './resolve-template-version.js';

export interface ApplyTrustedRegistryOptions
  extends Omit<CreateProjectOptions, 'templateId'> {
  templateId?: string;
}

export interface ApplyTrustedRegistryDependencies
  extends CreateProjectDependencies {
  prompt: Prompt;
}

export function projectActiveTemplates(
  registry: TemplateRegistryV2,
): TemplateDefinition[] {
  return registry.templates.flatMap((template) => {
    const version = template.versions.find((item) => item.status === 'active');

    return version === undefined
      ? []
      : [toMaterializableTemplate(template, version)];
  });
}

export async function applyTrustedRegistry(
  registry: TemplateRegistryV2,
  options: ApplyTrustedRegistryOptions,
  dependencies: ApplyTrustedRegistryDependencies,
): Promise<CreateProjectResult> {
  const templates = projectActiveTemplates(registry);
  const templateId =
    options.templateId ?? (await dependencies.prompt.selectTemplate(templates));
  const resolved = resolveTemplateVersion(
    registry,
    parseTemplateSelector(templateId),
  );
  const template = toMaterializableTemplate(
    resolved.template,
    resolved.version,
  );

  return createProjectFromTemplate(
    template,
    { ...options, templateId },
    dependencies,
  );
}

function toMaterializableTemplate(
  template: TemplateRegistryV2['templates'][number],
  version: TemplateVersion,
): TemplateDefinition {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    repository: template.repository,
    version: version.version,
    ref: version.ref,
  };
}
