import { migrate040To050, MigrationError } from '../index';

const legacy = (start: unknown) => ({
  vcon: '0.4.0',
  uuid: '01928e10-193e-8231-b9a2-279e0d16bc46',
  created_at: '2024-01-01T00:00:00Z',
  parties: [{ tel: '+15551230001' }],
  dialog: [{ type: 'text', start, parties: [0], body: 'hi', encoding: 'none', mediatype: 'text/plain' }]
});

describe('T1 dialog start check', () => {
  it('reports a non-RFC 3339 dialog start as unresolved, like the Python reference', () => {
    const { report } = migrate040To050(legacy('{{now}}'));
    const t1 = report.unresolved.filter(e => e.step === 'T1');
    expect(t1).toHaveLength(1);
    expect(t1[0].message).toBe("dialog[0] start '{{now}}' is not an RFC 3339 date-time; not used to derive a Session start.");
  });

  it('throws in strict mode', () => {
    expect(() => migrate040To050(legacy('{{now}}'), { strict: true })).toThrow(MigrationError);
  });

  it('says nothing for a valid start', () => {
    const { report } = migrate040To050(legacy('2024-01-01T00:00:00Z'));
    expect(report.unresolved.filter(e => e.step === 'T1')).toHaveLength(0);
  });
});
