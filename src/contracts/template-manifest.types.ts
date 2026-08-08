import type { NodeToolchain } from './node-toolchain.types.js';

export interface TemplateVariable {
  name: string;
  prompt: string;
  required: boolean;
  pattern?: string;
  default?: string;
}

export interface TemplateManifest {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  repository: string;
  variables: TemplateVariable[];
  render: {
    include: string[];
  };
  toolchain: NodeToolchain;
}
