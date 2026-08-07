# Changelog

## [0.3.2](https://github.com/jptecno/cli/compare/v0.3.1...v0.3.2) (2026-08-07)


### Bug Fixes

* **ci:** corrige imports ESM do Dangerfile ([0067469](https://github.com/jptecno/cli/commit/0067469580d34029b8baf11514550f466fd22a1d))
* **ci:** mantém TypeScript compatível com Danger ([68f2a71](https://github.com/jptecno/cli/commit/68f2a71eb121a3a85099958e888506ad00588e92))
* **harness:** fecha gaps de bootstrap e classificação ([a0a47c2](https://github.com/jptecno/cli/commit/a0a47c22ec05c20ce927a3b90d02cd8cd6e85dc3))
* **harness:** restringe revisores e comandos de risco ([b79804c](https://github.com/jptecno/cli/commit/b79804c57394c0b8029962c7cb8a2949684f2cd0))
* **release:** resolve conflito do lockfile na promoção ([05e2bb0](https://github.com/jptecno/cli/commit/05e2bb00321cefc964bae7bb22470fb5aa2d93c9))
* **semgrep:** cobre imports alternativos de child_process ([21dcdb3](https://github.com/jptecno/cli/commit/21dcdb3bda4e45131413c6ac4af8bdb68c010eaa))

## [0.3.1](https://github.com/jptecno/cli/compare/v0.3.0...v0.3.1) (2026-08-06)


### Bug Fixes

* **danger:** faz a automação seguir o padrão de pull request ([b750150](https://github.com/jptecno/cli/commit/b750150bd46139378c631cf97032ec37c5f6e6e6))
* **danger:** faz a automação seguir o padrão em vez de isentá-la ([2c06d0b](https://github.com/jptecno/cli/commit/2c06d0b1c0db78a40268fb24ddbf89bd242a0b30))
* **danger:** isenta também as pull requests do Dependabot ([daeb49c](https://github.com/jptecno/cli/commit/daeb49c987636b42cfcacbe1efbb4b89786afa40))
* **danger:** isenta também as pull requests do Dependabot ([eeb7a0c](https://github.com/jptecno/cli/commit/eeb7a0cf719e4ed4fc0b3f188a0fcbdb0286b825))

## [0.3.0](https://github.com/jptecno/cli/compare/v0.2.1...v0.3.0) (2026-08-06)


### Features

* **cli:** adiciona --help e --version e exige https no registry ([ddfb0b8](https://github.com/jptecno/cli/commit/ddfb0b862b94079f63b76d945c363b8db87632f4))
* **cli:** adiciona --help e --version e exige https no registry ([dc325f2](https://github.com/jptecno/cli/commit/dc325f2fc8cc2043ed76bc55e922a94d442fc53d))
* **init:** rejeita variáveis --set não declaradas ([1b196cb](https://github.com/jptecno/cli/commit/1b196cb608ac5ba1d69c424864265310ae32f461))
* **rede:** adiciona timeout aos downloads de templates ([8572a09](https://github.com/jptecno/cli/commit/8572a09fd0b7639803bc6418794d4d490e93c8ff))
* **registry:** valida ids kebab-case e únicos ([caaec4e](https://github.com/jptecno/cli/commit/caaec4e6ad292b808b803f44b11f493704dc7c91))
* **segurança:** endurece consumo de templates ([58e4a6b](https://github.com/jptecno/cli/commit/58e4a6b1849b5cfaa8512256ea911376f7f0d9e2))


### Bug Fixes

* **adapters:** baixa archive em stream com limite de tamanho ([86529a4](https://github.com/jptecno/cli/commit/86529a4ee82d616d976573a247fbc8b281a11924))
* **adapters:** executa comandos com spawn e saída herdada ([3949c4b](https://github.com/jptecno/cli/commit/3949c4bd4ab32d4fddc41aae28b8625e7dfeb265))
* corrige renderização, rollback, execução de comandos e download de template ([a18415a](https://github.com/jptecno/cli/commit/a18415a904d82b36556dbe53cf969d35404dbaee))
* **create-project:** corrige renderização, rollback e guarda de symlink ([6e3e6a9](https://github.com/jptecno/cli/commit/6e3e6a91f09747f9c130d2af41e8a2ad10d3cc77))
* **danger:** corrige resolução das políticas ([c87bed3](https://github.com/jptecno/cli/commit/c87bed3340a4bbcd1ed8ac74e856771d99cc0627))
* **danger:** corrige resolução das políticas ([847fa2b](https://github.com/jptecno/cli/commit/847fa2b1cf6e8598bc3e3083bb9b2d6d48d093a9))
* **danger:** isenta a Release PR do Release Please ([de63e31](https://github.com/jptecno/cli/commit/de63e31c2cf16d6dcdf4b8057305b2dacc18efd3))
* **danger:** isenta a Release PR do Release Please ([c6f9e75](https://github.com/jptecno/cli/commit/c6f9e757c12a0013dba465de653f08a216777d11))
* **danger:** libera atualização da política ([171b32b](https://github.com/jptecno/cli/commit/171b32bedcd62bbeb59ed63afa9db8fb948a3938))
* **danger:** trata bootstrap do dangerfile ([2590ba5](https://github.com/jptecno/cli/commit/2590ba5a2bbad9c576821f45eb9c59394506079c))
