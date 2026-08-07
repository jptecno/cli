import type {
  ResolvedTemplateVersion,
  ResolveTemplateVersionOptions,
  TemplateRegistryV2,
  TemplateSelector,
} from '../contracts/template-registry-v2.types.js';
import { CliError } from './cli-error.js';

export function parseTemplateSelector(
  template: string,
  templateVersion?: string,
): TemplateSelector {
  const separator = template.indexOf('@');
  const hasVersionInSelector = separator !== -1;

  if (
    template.trim() === '' ||
    (hasVersionInSelector &&
      (separator === 0 ||
        separator === template.length - 1 ||
        template.indexOf('@', separator + 1) !== -1))
  ) {
    throw new CliError('O seletor de template é inválido');
  }

  const id = hasVersionInSelector ? template.slice(0, separator) : template;
  const selectedVersion = hasVersionInSelector
    ? template.slice(separator + 1)
    : undefined;

  if (
    selectedVersion !== undefined &&
    templateVersion !== undefined &&
    selectedVersion !== templateVersion
  ) {
    throw new CliError('Foram informadas versões de template conflitantes');
  }

  return { id, version: selectedVersion ?? templateVersion };
}

export function resolveTemplateVersion(
  registry: TemplateRegistryV2,
  selector: TemplateSelector,
  options: ResolveTemplateVersionOptions = {},
): ResolvedTemplateVersion {
  const template = registry.templates.find((item) => item.id === selector.id);
  if (template === undefined) {
    throw new CliError('O template solicitado não foi encontrado');
  }

  const version =
    selector.version === undefined
      ? template.versions.find((item) => item.status === 'active')
      : template.versions.find((item) => item.version === selector.version);

  if (version === undefined) {
    throw new CliError('A versão solicitada do template não foi encontrada');
  }

  if (version.status === 'revoked') {
    throw new CliError('A versão revogada do template não pode ser utilizada');
  }

  if (version.status === 'deprecated' && !options.includeDeprecated) {
    throw new CliError('A versão descontinuada exige autorização explícita');
  }

  return {
    template,
    version,
    requiresDeprecatedConfirmation: version.status === 'deprecated',
  };
}
