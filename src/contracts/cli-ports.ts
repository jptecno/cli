import type {
  TemplateDefinition,
  TemplateRegistry,
} from './template-registry.types.js';

export interface RegistryClient {
  load(url: string): Promise<TemplateRegistry>;
}

export interface TemplateSource {
  materialize(template: TemplateDefinition, destination: string): Promise<void>;
}

export interface CommandExecutor {
  run(command: string, arguments_: string[], cwd: string): Promise<void>;
}

export interface Prompt {
  isInteractive(): boolean;
  selectTemplate(templates: TemplateDefinition[]): Promise<string>;
  ask(question: string, defaultValue?: string): Promise<string>;
  confirm(question: string, defaultValue: boolean): Promise<boolean>;
}
