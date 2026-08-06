import { describe, expect, it, vi } from 'vitest';

import { reportFindings } from '../../scripts/danger/report-findings.js';

describe('reportFindings', () => {
  it('encaminha finding objetivo para fail como bloqueante', () => {
    const fail = vi.fn();
    const warn = vi.fn();

    reportFindings(
      { failures: ['Título inválido.'], warnings: [] },
      { fail, warn },
    );

    expect(fail).toHaveBeenCalledWith('Título inválido.');
    expect(warn).not.toHaveBeenCalled();
  });

  it('encaminha warning para warn sem bloquear', () => {
    const fail = vi.fn();
    const warn = vi.fn();

    reportFindings({ failures: [], warnings: ['PR grande.'] }, { fail, warn });

    expect(warn).toHaveBeenCalledWith('PR grande.');
    expect(fail).not.toHaveBeenCalled();
  });
});
