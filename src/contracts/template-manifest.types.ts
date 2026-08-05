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
  variables: TemplateVariable[];
  render: {
    include: string[];
  };
  postCreate: {
    packageManager: 'npm';
    installCommand: 'npm install';
    validateCommand: 'npm run check';
  };
}
