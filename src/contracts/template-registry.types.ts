export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  repository: string;
  version: string;
  ref: string;
  commit?: string;
}

export interface TemplateRegistry {
  schemaVersion: 1;
  templates: TemplateDefinition[];
}
