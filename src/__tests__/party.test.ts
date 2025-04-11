import { Party } from '../party';
import { CivicAddress } from '../types';
import { PartyHistory } from '../party';

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

  it('should create a party with all properties', () => {
    const civicAddress: CivicAddress = {
      country: 'US',
      locality: 'New York',
      region: 'NY',
      postcode: '10001',
      street: '123 Main St'
    };
    
    const party = new Party({
      tel: '+1234567890',
      stir: 'stir-id',
      mailto: 'john@example.com',
      name: 'John Doe',
      validation: 'validated',
      gmlpos: '40.7128,-74.0060',
      civicaddress: civicAddress,
      uuid: 'test-uuid',
      role: 'customer',
      contact_list: 'contacts',
      meta: { key: 'value' }
    });
    
    expect(party.tel).toBe('+1234567890');
    expect(party.stir).toBe('stir-id');
    expect(party.mailto).toBe('john@example.com');
    expect(party.name).toBe('John Doe');
    expect(party.validation).toBe('validated');
    expect(party.gmlpos).toBe('40.7128,-74.0060');
    expect(party.civicaddress).toEqual(civicAddress);
    expect(party.uuid).toBe('test-uuid');
    expect(party.role).toBe('customer');
    expect(party.contact_list).toBe('contacts');
    expect(party.meta).toEqual({ key: 'value' });
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
  });
});

describe('PartyHistory', () => {
  it('should create party history with all properties', () => {
    const time = new Date();
    const history = new PartyHistory(0, 'joined', time);
    
    expect(history.party).toBe(0);
    expect(history.event).toBe('joined');
    expect(history.time).toBe(time);
    
    const dict = history.toDict();
    expect(dict).toEqual({
      party: 0,
      event: 'joined',
      time: time.toISOString()
    });
  });
}); 