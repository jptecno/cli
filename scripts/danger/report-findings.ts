import type { PolicyResults } from './pr-policies.js';

type DangerReporters = {
  fail: (message: string) => void;
  warn: (message: string) => void;
};

export function reportFindings(
  results: PolicyResults,
  reporters: DangerReporters,
): void {
  for (const message of results.failures) {
    reporters.fail(message);
  }

  for (const message of results.warnings) {
    reporters.warn(message);
  }
}
