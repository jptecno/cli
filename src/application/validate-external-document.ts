import type { AnySchema } from 'ajv';
import { Ajv } from 'ajv';

import type {
  RegistryContext,
  TemplateRegistryV2,
} from '../contracts/template-registry-v2.types.js';
import templateManifestV1Schema from '../schemas/template-manifest-v1.schema.json' with {
  type: 'json',
};
import templateRegistryV2Schema from '../schemas/template-registry-v2.schema.json' with {
  type: 'json',
};
import { CliError } from './cli-error.js';

const ajv = new Ajv({ allErrors: true, strict: true });
const validateOfficialTemplateRegistryV2 = ajv.compile<TemplateRegistryV2>(
  templateRegistryV2Schema,
);
const validateCustomTemplateRegistryV2 = ajv.compile<TemplateRegistryV2>(
  createCustomRegistrySchema(),
);
const validateTemplateManifestV1 = ajv.compile(templateManifestV1Schema);

export function assertTemplateRegistryV2Schema(
  value: unknown,
  context: RegistryContext = 'official',
): asserts value is TemplateRegistryV2 {
  const validate =
    context === 'official'
      ? validateOfficialTemplateRegistryV2
      : validateCustomTemplateRegistryV2;

  if (!validate(value)) {
    throw new CliError('O catálogo de templates v2 possui formato inválido');
  }
}

export function assertTemplateManifestV1Schema(value: unknown): void {
  if (!validateTemplateManifestV1(value)) {
    throw new CliError('O manifesto do template possui formato inválido');
  }
}

function createCustomRegistrySchema(): AnySchema {
  const schema = structuredClone(templateRegistryV2Schema);
  schema.$id = `${schema.$id}#custom`;

  const definitions = schema.definitions as Record<string, unknown>;
  const template = definitions.template as Record<string, unknown>;
  const properties = template.properties as Record<string, unknown>;
  const repository = properties.repository as Record<string, unknown>;

  repository.pattern = '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$';

  return schema;
}
