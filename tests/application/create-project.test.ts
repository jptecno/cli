import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { CliError } from '../../src/application/cli-error.js';
import { createProject } from '../../src/application/create-project.js';

import type {
  CommandExecutor,
  Prompt,
  TemplateSource,
} from '../../src/contracts/cli-ports.js';
import type { TemplateVariable } from '../../src/contracts/template-manifest.types.js';
import type { TemplateRegistry } from '../../src/contracts/template-registry.types.js';

const registry: TemplateRegistry = {
  schemaVersion: 1,
  templates: [
    {
      id: 'api-nodejs-typescript',
      name: 'API Node.js + TypeScript',
      description: 'Template de API',
      repository: 'jptecno/template-api-nodejs-typescript',
      version: 'v0.1.0',
      ref: 'v0.1.0',
    },
  ],
};

function getFirstTemplate(): TemplateRegistry['templates'][number] {
  const [firstTemplate] = registry.templates;

  if (!firstTemplate) {
    throw new Error('Fixture de teste inválida: registry sem templates');
  }

  return firstTemplate;
}

const validToolchain = {
  ecosystem: 'node',
  requirements: [
    { tool: 'node', minimumVersion: '24.0.0' },
    { tool: 'npm', minimumVersion: '11.0.0' },
  ],
  steps: {
    install: {
      command: 'npm',
      args: ['install'],
      dependsOn: [],
      recommended: true,
    },
  },
};

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('createProject', () => {
  it('renderiza o template, inicializa somente o git e nunca invoca npm', async () => {
    const destination = await createTemporaryDirectory();
    const commands: Array<{
      command: string;
      arguments_: string[];
      cwd: string;
    }> = [];

    const template = await createProject(
      registry,
      {
        destination,
        templateId: 'api-nodejs-typescript',
        values: { projectName: 'billing-api' },
        initializeGit: true,
      },
      {
        templateSource: createTemplateSource(),
        commandExecutor: {
          run: async (command, arguments_, cwd) => {
            commands.push({ command, arguments_, cwd });
          },
        },
        prompt: createPrompt(),
      },
    );

    expect(template.id).toBe('api-nodejs-typescript');
    await expect(
      readFile(join(destination, 'package.json'), 'utf8'),
    ).resolves.toContain('billing-api');
    await expect(
      readFile(join(destination, 'package.json'), 'utf8'),
    ).resolves.toContain('Descrição padrão');
    await expect(
      readFile(join(destination, '.env.example'), 'utf8'),
    ).resolves.toContain('/billing-api');
    await expect(access(join(destination, 'template.json'))).rejects.toThrow();
    await expect(access(join(destination, 'TEMPLATE.md'))).rejects.toThrow();
    expect(commands).toEqual([
      { command: 'git', arguments_: ['init'], cwd: destination },
    ]);
  });

  it('rejeita manifesto de repositório diferente antes de renderizar ou executar comandos', async () => {
    const destination = await createTemporaryDirectory();
    const commands: string[] = [];

    await expect(
      createProject(
        registry,
        {
          destination,
          templateId: 'api-nodejs-typescript',
          values: {},
          initializeGit: true,
        },
        {
          templateSource: {
            materialize: async (_template, target) => {
              await writeFile(
                join(target, 'template.json'),
                JSON.stringify({
                  schemaVersion: 1,
                  id: 'api-nodejs-typescript',
                  name: 'API Node.js + TypeScript',
                  description: 'Template de API',
                  repository: 'jptecno/outro-template',
                  variables: [],
                  render: { include: [] },
                  toolchain: validToolchain,
                }),
              );
            },
          },
          commandExecutor: {
            run: async (command) => {
              commands.push(command);
            },
          },
          prompt: createPrompt(),
        },
      ),
    ).rejects.toThrow('O manifesto baixado não corresponde ao repositório');

    expect(commands).toEqual([]);
  });

  it('rejeita manifesto postCreate legado antes de renderizar ou executar comandos', async () => {
    const destination = await createTemporaryDirectory();
    const commands: string[] = [];

    await expect(
      createProject(
        registry,
        {
          destination,
          templateId: 'api-nodejs-typescript',
          values: {},
          initializeGit: true,
        },
        {
          templateSource: {
            materialize: async (_template, target) => {
              await Promise.all([
                writeFile(
                  join(target, 'template.json'),
                  JSON.stringify({
                    schemaVersion: 1,
                    id: 'api-nodejs-typescript',
                    name: 'API Node.js + TypeScript',
                    description: 'Template de API',
                    variables: [],
                    render: { include: ['package.json'] },
                    postCreate: {
                      packageManager: 'npm',
                      installCommand: 'npm install',
                      validateCommand: 'npm run check',
                    },
                  }),
                ),
                writeFile(
                  join(target, 'package.json'),
                  '{"name":"{{projectName}}"}',
                ),
              ]);
            },
          },
          commandExecutor: {
            run: async (command) => {
              commands.push(command);
            },
          },
          prompt: createPrompt(),
        },
      ),
    ).rejects.toThrow('O manifesto do template possui formato inválido');

    expect(commands).toEqual([]);
    await expect(readdir(destination)).resolves.toEqual([]);
  });

  it('preserva valores com aspas como dados JSON, sem injetar scripts npm', async () => {
    const destination = await createTemporaryDirectory();
    const description =
      'API "financeira", "scripts": {"preinstall":"malicioso"}';

    await createProject(
      registry,
      {
        destination,
        templateId: 'api-nodejs-typescript',
        values: { projectName: 'billing-api', description },
        initializeGit: false,
      },
      {
        templateSource: createTemplateSource(),
        commandExecutor: createCommandExecutor(),
        prompt: createPrompt(),
      },
    );

    const packageJson = JSON.parse(
      await readFile(join(destination, 'package.json'), 'utf8'),
    ) as { description: string; scripts?: unknown };

    expect(packageJson.description).toBe(description);
    expect(packageJson.scripts).toBeUndefined();
  });

  it('não trata propriedades herdadas como valores fornecidos', async () => {
    const destination = await createTemporaryDirectory();
    const questions: string[] = [];

    await createProject(
      registry,
      {
        destination,
        templateId: 'api-nodejs-typescript',
        values: {},
        initializeGit: false,
      },
      {
        templateSource: {
          materialize: async (_template, target) => {
            await Promise.all([
              writeFile(
                join(target, 'template.json'),
                JSON.stringify({
                  schemaVersion: 1,
                  id: 'api-nodejs-typescript',
                  name: 'API Node.js + TypeScript',
                  description: 'Template de API',
                  variables: [
                    {
                      name: 'constructor',
                      prompt: 'Valor do construtor',
                      required: true,
                    },
                  ],
                  render: { include: ['arquivo.txt'] },
                  repository: 'jptecno/template-api-nodejs-typescript',
                  toolchain: validToolchain,
                }),
              ),
              writeFile(join(target, 'arquivo.txt'), '{{constructor}}'),
            ]);
          },
        },
        commandExecutor: createCommandExecutor(),
        prompt: {
          ask: async (question) => {
            questions.push(question);
            return 'valor-seguro';
          },
          selectTemplate: async () => 'api-nodejs-typescript',
        },
      },
    );

    expect(questions).toEqual(['Valor do construtor']);
    await expect(
      readFile(join(destination, 'arquivo.txt'), 'utf8'),
    ).resolves.toBe('valor-seguro');
  });

  it('rejeita arquivos declarados como links simbólicos', async () => {
    const destination = await createTemporaryDirectory();

    await expect(
      createProject(
        registry,
        {
          destination,
          templateId: 'api-nodejs-typescript',
          values: { projectName: 'billing-api' },
          initializeGit: false,
        },
        {
          templateSource: {
            materialize: async (_template, target) => {
              await createTemplateSource().materialize(
                getFirstTemplate(),
                target,
              );
              await writeFile(
                join(target, 'outside.json'),
                '{"name":"outside"}',
              );
              await rm(join(target, 'package.json'));
              await symlink(
                join(target, 'outside.json'),
                join(target, 'package.json'),
              );
            },
          },
          commandExecutor: createCommandExecutor(),
          prompt: createPrompt(),
        },
      ),
    ).rejects.toThrow('O template declarou um arquivo inválido');
  });

  it('rejeita template.json quando é um link simbólico', async () => {
    const destination = await createTemporaryDirectory();

    await expect(
      createProject(
        registry,
        {
          destination,
          templateId: 'api-nodejs-typescript',
          values: { projectName: 'billing-api' },
          initializeGit: false,
        },
        {
          templateSource: {
            materialize: async (_template, target) => {
              await createTemplateSource().materialize(
                getFirstTemplate(),
                target,
              );
              await writeFile(join(target, 'manifest-source.json'), '{}');
              await rm(join(target, 'template.json'));
              await symlink(
                join(target, 'manifest-source.json'),
                join(target, 'template.json'),
              );
            },
          },
          commandExecutor: createCommandExecutor(),
          prompt: createPrompt(),
        },
      ),
    ).rejects.toThrow('O template declarou um arquivo inválido');
  });

  it('não sobrescreve um diretório não vazio', async () => {
    const destination = await createTemporaryDirectory();
    await writeFile(join(destination, 'existing-file.txt'), 'preservar');

    await expect(
      createProject(
        registry,
        {
          destination,
          templateId: 'api-nodejs-typescript',
          values: { projectName: 'billing-api' },
          initializeGit: false,
        },
        {
          templateSource: createTemplateSource(),
          commandExecutor: createCommandExecutor(),
          prompt: createPrompt(),
        },
      ),
    ).rejects.toThrow(
      new CliError(`O diretório de destino não está vazio: ${destination}`),
    );

    await expect(
      readFile(join(destination, 'existing-file.txt'), 'utf8'),
    ).resolves.toBe('preservar');
  });

  it('rejeita uma chave informada por --set que não é declarada pelo template', async () => {
    const destination = await createTemporaryDirectory();

    await expect(
      createProject(
        registry,
        {
          destination,
          templateId: 'api-nodejs-typescript',
          values: { projectName: 'billing-api', ambiente: 'produção' },
          initializeGit: false,
        },
        {
          templateSource: createTemplateSource(),
          commandExecutor: createCommandExecutor(),
          prompt: createPrompt(),
        },
      ),
    ).rejects.toThrow(
      'A variável informada não existe no template: ambiente. Use apenas variáveis declaradas pelo template.',
    );
  });

  it('rejeita um valor que não atende ao padrão definido pelo template', async () => {
    const destination = await createTemporaryDirectory();

    await expect(
      createProject(
        registry,
        {
          destination,
          templateId: 'api-nodejs-typescript',
          values: { projectName: 'Billing API' },
          initializeGit: false,
        },
        {
          templateSource: createTemplateSource(),
          commandExecutor: createCommandExecutor(),
          prompt: createPrompt(),
        },
      ),
    ).rejects.toThrow('O valor da variável projectName é inválido');
  });

  it('preserva um placeholder não declarado embutido em um valor, tanto em JSON quanto em texto puro', async () => {
    const destination = await createTemporaryDirectory();

    await createProject(
      registry,
      {
        destination,
        templateId: 'api-nodejs-typescript',
        values: {
          projectName: 'billing-api',
          description: '{{naoDeclarada}}',
        },
        initializeGit: false,
      },
      {
        templateSource: createTemplateSource(),
        commandExecutor: createCommandExecutor(),
        prompt: createPrompt(),
      },
    );

    const packageJson = JSON.parse(
      await readFile(join(destination, 'package.json'), 'utf8'),
    ) as { description: string };

    expect(packageJson.description).toBe('{{naoDeclarada}}');
    await expect(
      readFile(join(destination, 'README.md'), 'utf8'),
    ).resolves.toContain('{{naoDeclarada}}');
  });

  it('produz o mesmo resultado de renderização independente da ordem de declaração das variáveis no manifesto', async () => {
    const values = {
      projectName: 'billing-api',
      description: '{{naoDeclarada}}',
    };

    const renderedComOrdemOriginal = await renderPackageJsonWithVariableOrder(
      ['projectName', 'description'],
      values,
    );
    const renderedComOrdemInvertida = await renderPackageJsonWithVariableOrder(
      ['description', 'projectName'],
      values,
    );

    expect(renderedComOrdemOriginal).toBe(renderedComOrdemInvertida);
    expect(renderedComOrdemOriginal).toContain('{{naoDeclarada}}');
  });

  it('remove por completo o destino criado pelo CLI quando a extração falha após materialize', async () => {
    const workingDirectory = await createTemporaryDirectory();
    const destination = join(workingDirectory, 'novo-projeto');

    await expect(
      createProject(
        registry,
        {
          destination,
          templateId: 'api-nodejs-typescript',
          values: {},
          initializeGit: false,
        },
        {
          templateSource: {
            materialize: async (_template, target) => {
              await writeFile(
                join(target, 'template.json'),
                '{"manifestoInvalido":true}',
              );
            },
          },
          commandExecutor: createCommandExecutor(),
          prompt: createPrompt(),
        },
      ),
    ).rejects.toThrow(CliError);

    await expect(access(destination)).rejects.toThrow();
  });

  it('preserva o diretório de destino pré-existente, removendo apenas o conteúdo criado, quando a extração falha', async () => {
    const destination = await createTemporaryDirectory();

    await expect(
      createProject(
        registry,
        {
          destination,
          templateId: 'api-nodejs-typescript',
          values: {},
          initializeGit: false,
        },
        {
          templateSource: {
            materialize: async (_template, target) => {
              await writeFile(
                join(target, 'template.json'),
                '{"manifestoInvalido":true}',
              );
            },
          },
          commandExecutor: createCommandExecutor(),
          prompt: createPrompt(),
        },
      ),
    ).rejects.toThrow(CliError);

    await expect(access(destination)).resolves.toBeUndefined();
    await expect(readdir(destination)).resolves.toEqual([]);
  });

  it('traduz destino que é um arquivo em CliError com mensagem em português', async () => {
    const workingDirectory = await createTemporaryDirectory();
    const destination = join(workingDirectory, 'arquivo-existente');
    await writeFile(destination, 'conteúdo');

    await expect(
      createProject(
        registry,
        {
          destination,
          templateId: 'api-nodejs-typescript',
          values: { projectName: 'billing-api' },
          initializeGit: false,
        },
        {
          templateSource: createTemplateSource(),
          commandExecutor: createCommandExecutor(),
          prompt: createPrompt(),
        },
      ),
    ).rejects.toThrow(
      new CliError(
        `O destino informado é um arquivo, não um diretório: ${destination}`,
      ),
    );
  });

  it('rejeita renderização através de um diretório intermediário que é link simbólico para fora do destino', async () => {
    const workingDirectory = await createTemporaryDirectory();
    const destination = join(workingDirectory, 'projeto');
    const outside = join(workingDirectory, 'fora');
    await mkdir(outside, { recursive: true });
    await writeFile(
      join(outside, 'app.json'),
      '{"secret":"dados-fora-do-destino"}',
    );

    await expect(
      createProject(
        registry,
        {
          destination,
          templateId: 'api-nodejs-typescript',
          values: {},
          initializeGit: false,
        },
        {
          templateSource: {
            materialize: async (_template, target) => {
              await writeFile(
                join(target, 'template.json'),
                JSON.stringify({
                  schemaVersion: 1,
                  id: 'api-nodejs-typescript',
                  name: 'API Node.js + TypeScript',
                  description: 'Template de API',
                  variables: [],
                  render: { include: ['cfg/app.json'] },
                  repository: 'jptecno/template-api-nodejs-typescript',
                  toolchain: validToolchain,
                }),
              );
              await symlink(join(target, '..', 'fora'), join(target, 'cfg'));
            },
          },
          commandExecutor: createCommandExecutor(),
          prompt: createPrompt(),
        },
      ),
    ).rejects.toThrow(
      'O manifesto tentou acessar um arquivo fora do diretório do projeto',
    );

    await expect(access(destination)).rejects.toThrow();
    await expect(readFile(join(outside, 'app.json'), 'utf8')).resolves.toBe(
      '{"secret":"dados-fora-do-destino"}',
    );
  });

  it('repete o prompt até 3 vezes quando o valor obrigatório vem vazio e aceita o valor válido informado depois', async () => {
    const destination = await createTemporaryDirectory();
    let callCount = 0;

    const template = await createProject(
      registry,
      {
        destination,
        templateId: 'api-nodejs-typescript',
        values: {},
        initializeGit: false,
      },
      {
        templateSource: createTemplateSource(),
        commandExecutor: createCommandExecutor(),
        prompt: {
          ask: async (_question, defaultValue) => {
            callCount += 1;

            if (callCount < 3) {
              return '';
            }

            return callCount === 3 ? 'billing-api' : (defaultValue ?? '');
          },
          selectTemplate: async () => 'api-nodejs-typescript',
        },
      },
    );

    expect(template.id).toBe('api-nodejs-typescript');
    expect(callCount).toBe(4);
    await expect(
      readFile(join(destination, 'package.json'), 'utf8'),
    ).resolves.toContain('billing-api');
  });

  it('aborta após 3 tentativas de prompt quando o valor obrigatório continua vazio', async () => {
    const destination = await createTemporaryDirectory();
    let callCount = 0;

    await expect(
      createProject(
        registry,
        {
          destination,
          templateId: 'api-nodejs-typescript',
          values: {},
          initializeGit: false,
        },
        {
          templateSource: createTemplateSource(),
          commandExecutor: createCommandExecutor(),
          prompt: {
            ask: async () => {
              callCount += 1;
              return '';
            },
            selectTemplate: async () => 'api-nodejs-typescript',
          },
        },
      ),
    ).rejects.toThrow('A variável projectName é obrigatória');

    expect(callCount).toBe(3);
  });

  it('falha imediatamente quando o valor de --set é inválido, sem chamar o prompt', async () => {
    const destination = await createTemporaryDirectory();
    const askCalls: string[] = [];

    await expect(
      createProject(
        registry,
        {
          destination,
          templateId: 'api-nodejs-typescript',
          values: { projectName: 'Billing API' },
          initializeGit: false,
        },
        {
          templateSource: createTemplateSource(),
          commandExecutor: createCommandExecutor(),
          prompt: {
            ask: async (question) => {
              askCalls.push(question);
              return '';
            },
            selectTemplate: async () => 'api-nodejs-typescript',
          },
        },
      ),
    ).rejects.toThrow('O valor da variável projectName é inválido');

    expect(askCalls).toEqual([]);
  });

  it('propaga a falha de git init sem executar etapas da toolchain', async () => {
    const destination = await createTemporaryDirectory();

    await expect(
      createProject(
        registry,
        {
          destination,
          templateId: 'api-nodejs-typescript',
          values: { projectName: 'billing-api' },
          initializeGit: true,
        },
        {
          templateSource: createTemplateSource(),
          commandExecutor: createFailingCommandExecutor('git', ['init']),
          prompt: createPrompt(),
        },
      ),
    ).rejects.toThrow('Falha ao executar git init: código de saída 1');

    await expect(access(destination)).resolves.toBeUndefined();
    await expect(
      readFile(join(destination, 'package.json'), 'utf8'),
    ).resolves.toContain('billing-api');
  });
});

function createTemplateSource(): TemplateSource {
  return {
    materialize: async (_template, destination) => {
      await Promise.all([
        writeFile(
          join(destination, 'template.json'),
          JSON.stringify({
            schemaVersion: 1,
            id: 'api-nodejs-typescript',
            name: 'API Node.js + TypeScript',
            description: 'Template de API',
            variables: [
              {
                name: 'projectName',
                prompt: 'Nome do projeto',
                required: true,
                pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
              },
              {
                name: 'description',
                prompt: 'Descrição do projeto',
                required: false,
                default: 'Descrição padrão',
              },
            ],
            render: {
              include: [
                'package.json',
                'package-lock.json',
                '.env.example',
                'README.md',
              ],
            },
            repository: 'jptecno/template-api-nodejs-typescript',
            toolchain: validToolchain,
          }),
        ),
        writeFile(
          join(destination, 'package.json'),
          '{"name":"{{projectName}}","description":"{{description}}"}',
        ),
        writeFile(
          join(destination, 'package-lock.json'),
          '{"name":"{{projectName}}","description":"{{description}}"}',
        ),
        writeFile(
          join(destination, '.env.example'),
          'DATABASE_URL=postgresql://localhost/{{projectName}}',
        ),
        writeFile(
          join(destination, 'README.md'),
          '# {{projectName}}\n\n{{description}}',
        ),
        writeFile(join(destination, 'TEMPLATE.md'), 'Metadados do template'),
      ]);
    },
  };
}

function createCommandExecutor(): CommandExecutor {
  return { run: async () => undefined };
}

function createFailingCommandExecutor(
  failingCommand: string,
  failingArguments: string[],
): CommandExecutor {
  return {
    run: async (command, arguments_) => {
      if (
        command === failingCommand &&
        arguments_.join(' ') === failingArguments.join(' ')
      ) {
        throw new CliError(
          `Falha ao executar ${command} ${arguments_.join(' ')}: código de saída 1`,
        );
      }
    },
  };
}

const PACKAGE_JSON_VARIABLE_DEFINITIONS: Record<
  'projectName' | 'description',
  TemplateVariable
> = {
  projectName: {
    name: 'projectName',
    prompt: 'Nome do projeto',
    required: true,
    pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
  },
  description: {
    name: 'description',
    prompt: 'Descrição do projeto',
    required: false,
    default: 'Descrição padrão',
  },
};

async function renderPackageJsonWithVariableOrder(
  order: ReadonlyArray<'projectName' | 'description'>,
  values: Record<string, string>,
): Promise<string> {
  const destination = await createTemporaryDirectory();

  await createProject(
    registry,
    {
      destination,
      templateId: 'api-nodejs-typescript',
      values,
      initializeGit: false,
    },
    {
      templateSource: {
        materialize: async (_template, target) => {
          await Promise.all([
            writeFile(
              join(target, 'template.json'),
              JSON.stringify({
                schemaVersion: 1,
                id: 'api-nodejs-typescript',
                name: 'API Node.js + TypeScript',
                description: 'Template de API',
                variables: order.map(
                  (name) => PACKAGE_JSON_VARIABLE_DEFINITIONS[name],
                ),
                render: { include: ['package.json'] },
                repository: 'jptecno/template-api-nodejs-typescript',
                toolchain: validToolchain,
              }),
            ),
            writeFile(
              join(target, 'package.json'),
              '{"name":"{{projectName}}","description":"{{description}}"}',
            ),
          ]);
        },
      },
      commandExecutor: createCommandExecutor(),
      prompt: createPrompt(),
    },
  );

  return readFile(join(destination, 'package.json'), 'utf8');
}

function createPrompt(): Prompt {
  return {
    ask: async (_question, defaultValue) => defaultValue ?? '',
    selectTemplate: async () => 'api-nodejs-typescript',
  };
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'jp-cli-test-'));
  temporaryDirectories.push(directory);
  return directory;
}
