export type RegistryContext = 'official' | 'custom';

export type TemplateVersionStatus = 'active' | 'deprecated' | 'revoked';

export interface TemplateVersion {
  version: string;
  ref: string;
  commit: string;
  status: TemplateVersionStatus;
  statusReason?: string;
  replacement?: string;
}

export interface TemplateDefinitionV2 {
  id: string;
  name: string;
  description: string;
  repository: string;
  versions: TemplateVersion[];
}

export interface TemplateRegistryV2 {
  schemaVersion: 2;
  revision: number;
  publishedAt: string;
  templates: TemplateDefinitionV2[];
}

export interface TemplateSelector {
  id: string;
  version?: string;
}

export interface ResolveTemplateVersionOptions {
  includeDeprecated?: boolean;
}

export interface ResolvedTemplateVersion {
  template: TemplateDefinitionV2;
  version: TemplateVersion;
  requiresDeprecatedConfirmation: boolean;
}
