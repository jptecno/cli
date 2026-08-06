import { spawn } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProcessCommandExecutor } from '../../src/adapters/process-command-executor.js';
import { CliError } from '../../src/application/cli-error.js';

describe('ProcessCommandExecutor', () => {
  let executor: ProcessCommandExecutor;
  let workingDirectory: string;

  beforeEach(async () => {
    executor = new ProcessCommandExecutor();
    // process.cwd() no processo filho resolve links simbólicos (ex.: /tmp ->
    // /private/tmp no macOS), então normalizamos aqui para comparar com o
    // valor observado dentro do script.
    workingDirectory = await realpath(
      await mkdtemp(join(tmpdir(), 'jp-cli-process-executor-')),
    );
  });

  afterEach(async () => {
    await rm(workingDirectory, { recursive: true, force: true });
  });

  it('resolve quando o comando finaliza com código de saída 0', async () => {
    await expect(
      executor.run(
        process.execPath,
        ['-e', 'process.exit(0)'],
        workingDirectory,
      ),
    ).resolves.toBeUndefined();
  });

  it('rejeita com CliError em português contendo o código de saída quando o comando falha', async () => {
    const result = executor.run(
      process.execPath,
      ['-e', 'process.exit(7)'],
      workingDirectory,
    );

    await expect(result).rejects.toBeInstanceOf(CliError);
    await expect(result).rejects.toThrow(/código de saída 7/);
  });

  it('rejeita com CliError (não uma exceção crua) quando o binário não existe', async () => {
    const result = executor.run(
      'binario-inexistente-jp-cli-teste',
      [],
      workingDirectory,
    );

    await expect(result).rejects.toBeInstanceOf(CliError);
    await expect(result).rejects.toThrow('Falha ao executar');
  });

  it('respeita o cwd informado, verificado por efeito colateral no sistema de arquivos', async () => {
    const script =
      "require('node:fs').writeFileSync('marcador.txt', String(process.cwd()))";

    await executor.run(process.execPath, ['-e', script], workingDirectory);

    const marcador = await readFile(
      join(workingDirectory, 'marcador.txt'),
      'utf8',
    );
    expect(marcador).toBe(workingDirectory);
  });

  it('não falha com saída muito maior que o antigo limite de 1 MB do maxBuffer', async () => {
    // Regressão: execFile/promisify tinha maxBuffer padrão de 1 MB e rejeitava
    // com ENOBUFS. stdio: 'inherit' não bufferiza, então isso deve resolver —
    // mas herdar 'inherit' aqui jogaria ~1,5 MB de saída no terminal do
    // Vitest a cada execução da suíte.
    //
    // Para manter a asserção real (nenhum buffer de 1 MB no caminho) sem
    // poluir o log, o comando grande roda dentro de um processo
    // intermediário (via tsx, já que ProcessCommandExecutor é TypeScript e
    // não há dist/ garantido neste momento). Este teste spawna o
    // intermediário com stdio: ['ignore', 'ignore', 'inherit']; como
    // ProcessCommandExecutor.run usa stdio: 'inherit' internamente, o
    // processo-neto que gera os 1,5 MB herda o stdout já ignorado do
    // intermediário — nenhuma saída chega a este processo de teste.
    // Confirmado empiricamente: a saída medida é 0 bytes.
    const adapterUrl = new URL(
      '../../src/adapters/process-command-executor.ts',
      import.meta.url,
    ).href;
    const tsxBinaryPath = fileURLToPath(
      new URL('../../node_modules/.bin/tsx', import.meta.url),
    );
    const bigOutputScript =
      "const chunk = 'x'.repeat(1024); for (let i = 0; i < 1536; i++) { process.stdout.write(chunk); }";

    const intermediateScript = [
      `import(${JSON.stringify(adapterUrl)}).then(({ ProcessCommandExecutor }) => {`,
      '  const executor = new ProcessCommandExecutor();',
      `  return executor.run(${JSON.stringify(process.execPath)}, ['-e', ${JSON.stringify(bigOutputScript)}], ${JSON.stringify(workingDirectory)});`,
      '}).then(() => process.exit(0)).catch(() => process.exit(1));',
    ].join('\n');

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const child = spawn(tsxBinaryPath, ['-e', intermediateScript], {
        stdio: ['ignore', 'ignore', 'inherit'],
      });

      child.on('error', reject);
      child.on('close', resolve);
    });

    expect(exitCode).toBe(0);
  });

  it('no Windows, sufixa apenas npm com .cmd e mantém git sem sufixo', async () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      process,
      'platform',
    );
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true,
    });

    try {
      // Neste ambiente (não Windows) não existe "npm.cmd" no PATH, então a
      // resolução para win32 deve falhar com CliError (ENOENT), confirmando
      // que o sufixo foi aplicado — e não travar como exceção crua.
      await expect(
        executor.run('npm', ['--version'], workingDirectory),
      ).rejects.toBeInstanceOf(CliError);

      // "git" não deve receber sufixo .cmd; como o binário real existe neste
      // ambiente, a execução deve funcionar normalmente mesmo com
      // process.platform simulado como win32.
      await expect(
        executor.run('git', ['--version'], workingDirectory),
      ).resolves.toBeUndefined();
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(process, 'platform', originalDescriptor);
      }
    }
  });
});
