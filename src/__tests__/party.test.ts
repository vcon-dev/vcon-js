import { Party, PartyHistory } from '../party';
import { CivicAddress } from '../types';

describe('Party', () => {
  it('should create a party with minimal properties', () => {
    const party = new Party({
      tel: '+1234567890',
      name: 'John Doe'
    });

    expect(party.tel).toBe('+1234567890');
    expect(party.name).toBe('John Doe');
    expect(party.toDict()).toEqual({
      tel: '+1234567890',
      name: 'John Doe'
    });
  });

  it('should create a party with all vcon-core-01 properties', () => {
    const civicAddress: CivicAddress = {
      country: 'US',
      a1: 'NY',
      a3: 'New York',
      pc: '10001',
      a6: '123 Main St',
      // Legacy fields
      locality: 'New York',
      region: 'NY',
      postcode: '10001',
      street: '123 Main St'
    };

    const party = new Party({
      tel: '+1234567890',
      sip: 'sip:john@example.com',
      mailto: 'john@example.com',
      stir: 'stir-passport-token',
      did: 'did:example:123456',
      name: 'John Doe',
      uuid: 'test-uuid',
      validation: 'verified',
      gmlpos: '40.7128,-74.0060',
      civicaddress: civicAddress,
      timezone: 'America/New_York',
      role: 'customer',
      contact_list: 'contacts',
      meta: { key: 'value' },
      id: 'john.doe'
    });

    expect(party.tel).toBe('+1234567890');
    expect(party.sip).toBe('sip:john@example.com');
    expect(party.mailto).toBe('john@example.com');
    expect(party.stir).toBe('stir-passport-token');
    expect(party.did).toBe('did:example:123456');
    expect(party.name).toBe('John Doe');
    expect(party.uuid).toBe('test-uuid');
    expect(party.validation).toBe('verified');
    expect(party.gmlpos).toBe('40.7128,-74.0060');
    expect(party.civicaddress).toEqual(civicAddress);
    expect(party.timezone).toBe('America/New_York');
    expect(party.role).toBe('customer');
    expect(party.contact_list).toBe('contacts');
    expect(party.meta).toEqual({ key: 'value' });
    expect(party.id).toBe('john.doe');
  });

  it('should handle undefined properties in toDict', () => {
    const party = new Party({
      tel: '+1234567890'
    });

    const dict = party.toDict();
    expect(dict).toEqual({
      tel: '+1234567890'
    });
    expect(dict.name).toBeUndefined();
    expect(dict.sip).toBeUndefined();
    expect(dict.did).toBeUndefined();
  });

  it('should check for identifier', () => {
    const partyWithTel = new Party({ tel: '+1234567890' });
    expect(partyWithTel.hasIdentifier()).toBe(true);

    const partyWithSip = new Party({ sip: 'sip:user@example.com' });
    expect(partyWithSip.hasIdentifier()).toBe(true);

    const partyWithMailto = new Party({ mailto: 'user@example.com' });
    expect(partyWithMailto.hasIdentifier()).toBe(true);

    const partyWithDid = new Party({ did: 'did:example:123' });
    expect(partyWithDid.hasIdentifier()).toBe(true);

    const partyWithUuid = new Party({ uuid: 'test-uuid' });
    expect(partyWithUuid.hasIdentifier()).toBe(true);

    const partyWithStir = new Party({ stir: 'stir-token' });
    expect(partyWithStir.hasIdentifier()).toBe(true);

    const partyNoIdentifier = new Party({ name: 'John' });
    expect(partyNoIdentifier.hasIdentifier()).toBe(false);
  });

  it('should get primary identifier', () => {
    const partyWithTel = new Party({ tel: '+1234567890', mailto: 'user@example.com' });
    expect(partyWithTel.getPrimaryIdentifier()).toBe('+1234567890');

    const partyWithSip = new Party({ sip: 'sip:user@example.com' });
    expect(partyWithSip.getPrimaryIdentifier()).toBe('sip:user@example.com');

    const partyNoIdentifier = new Party({ name: 'John' });
    expect(partyNoIdentifier.getPrimaryIdentifier()).toBeUndefined();
  });

  it('should validate party', () => {
    const partyWithIdentifier = new Party({ tel: '+1234567890' });
    const result1 = partyWithIdentifier.validate();
    expect(result1.valid).toBe(true);
    expect(result1.warnings.length).toBe(0);

    const partyNoIdentifier = new Party({ name: 'John' });
    const result2 = partyNoIdentifier.validate();
    expect(result2.valid).toBe(true); // Parties are always valid
    expect(result2.warnings.length).toBe(1);
    expect(result2.warnings[0]).toContain('no identifier');
  });

  it('should support arbitrary extension properties', () => {
    const party = new Party({
      tel: '+1234567890',
      customField: 'custom value',
      anotherField: 123
    });

    expect(party.customField).toBe('custom value');
    expect(party.anotherField).toBe(123);

    const dict = party.toDict();
    expect(dict.customField).toBe('custom value');
    expect(dict.anotherField).toBe(123);
  });
});

describe('PartyHistory', () => {
  it('should create party history with Date object', () => {
    const time = new Date('2025-01-15T10:00:00Z');
    const history = new PartyHistory(0, 'joined', time);

    expect(history.party).toBe(0);
    expect(history.event).toBe('joined');
    expect(history.time).toBe(time);

    const dict = history.toDict();
    expect(dict).toEqual({
      party: 0,
      event: 'joined',
      time: '2025-01-15T10:00:00.000Z'
    });
  });

  it('should create party history with string time', () => {
    const timeStr = '2025-01-15T10:00:00Z';
    const history = new PartyHistory(0, 'joined', timeStr);

    expect(history.time).toBe(timeStr);

    const dict = history.toDict();
    expect(dict.time).toBe(timeStr);
  });

  it('should create party history from dict', () => {
    const data = {
      party: 1,
      event: 'left',
      time: '2025-01-15T11:00:00Z'
    };

    const history = PartyHistory.fromDict(data);

    expect(history.party).toBe(1);
    expect(history.event).toBe('left');
    expect(history.time).toBe('2025-01-15T11:00:00Z');
  });

  it('should support various event types', () => {
    const events = ['joined', 'left', 'hold', 'resume', 'mute', 'unmute'];

    events.forEach(event => {
      const history = new PartyHistory(0, event, new Date());
      expect(history.event).toBe(event);
    });
  });
});
