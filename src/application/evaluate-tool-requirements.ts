import type {
  ToolchainRequirement,
  ToolInspection,
  ToolInspector,
  ToolRequirementResult,
} from './toolchain.types.js';
import { isSupportedTool } from './toolchain.types.js';

export async function evaluateToolRequirements(
  requirements: ToolchainRequirement[],
  toolInspector: ToolInspector,
): Promise<ToolRequirementResult[]> {
  return Promise.all(
    requirements.map(async (requirement) => {
      if (!isSupportedTool(requirement.tool)) {
        return {
          tool: requirement.tool,
          minimumVersion: requirement.minimumVersion,
          status: 'unsupported' as const,
        };
      }

      return {
        tool: requirement.tool,
        minimumVersion: requirement.minimumVersion,
        status: evaluateInspection(
          requirement.minimumVersion,
          await toolInspector.inspect(requirement.tool),
        ),
      };
    }),
  );
}

function evaluateInspection(
  minimumVersion: string,
  inspection: ToolInspection,
): ToolRequirementResult['status'] {
  if (inspection.status === 'unavailable') {
    return 'unavailable';
  }

  if (inspection.status === 'failed') {
    return 'inspection-failed';
  }

  const installedVersion = parseVersion(inspection.versionOutput);
  const requiredVersion = parseVersion(minimumVersion);

  if (!installedVersion || !requiredVersion) {
    return 'invalid-version';
  }

  return compareVersions(installedVersion, requiredVersion) >= 0
    ? 'satisfied'
    : 'below-minimum';
}

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

function parseVersion(value: string | undefined): ParsedVersion | undefined {
  if (!value) {
    return undefined;
  }

  const match =
    /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?\s*$/.exec(
      value,
    );

  if (!match) {
    return undefined;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2] ?? '0'),
    patch: Number(match[3] ?? '0'),
    prerelease: match[4]?.split('.') ?? [],
  };
}

function compareVersions(left: ParsedVersion, right: ParsedVersion): number {
  const coreComparison =
    left.major - right.major ||
    left.minor - right.minor ||
    left.patch - right.patch;

  if (coreComparison !== 0) {
    return coreComparison;
  }

  return comparePrereleaseVersions(left.prerelease, right.prerelease);
}

function comparePrereleaseVersions(left: string[], right: string[]): number {
  if (left.length === 0) {
    return right.length === 0 ? 0 : 1;
  }

  if (right.length === 0) {
    return -1;
  }

  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    const leftIdentifier = left[index];
    const rightIdentifier = right[index];

    if (leftIdentifier === undefined || rightIdentifier === undefined) {
      break;
    }

    if (leftIdentifier === rightIdentifier) {
      continue;
    }

    const leftIsNumeric = /^\d+$/.test(leftIdentifier);
    const rightIsNumeric = /^\d+$/.test(rightIdentifier);

    if (leftIsNumeric && rightIsNumeric) {
      return Number(leftIdentifier) - Number(rightIdentifier);
    }

    if (leftIsNumeric !== rightIsNumeric) {
      return leftIsNumeric ? -1 : 1;
    }

    return leftIdentifier < rightIdentifier ? -1 : 1;
  }

  return left.length - right.length;
}
