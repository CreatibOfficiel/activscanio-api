import { BaseCharactersService } from './base-characters.service';

describe('BaseCharactersService alumni availability', () => {
  const active = { id: 'active', firstName: 'Actif', leftAt: null };
  const alumni = { id: 'alumni', firstName: 'Ancien', leftAt: '2020-01-01' };
  const character = {
    id: 'yoshi',
    name: 'Yoshi',
    imageUrl: '',
    variants: [
      { id: 'green', label: 'Vert', imageUrl: '', competitor: active },
      { id: 'red', label: 'Rouge', imageUrl: '', competitor: alumni },
      { id: 'blue', label: 'Bleu', imageUrl: '', competitor: null },
    ],
  };

  it('keeps each color separate and releases only an alumni color', async () => {
    const repository = { find: jest.fn().mockResolvedValue([character]) };
    const service = new BaseCharactersService(repository as never);
    const [yoshi] = await service.findAllWithAvailabilityStatus();
    expect(yoshi.variants.map((variant) => [variant.label, variant.isAvailable])).toEqual([
      ['Vert', false],
      ['Rouge', true],
      ['Bleu', true],
    ]);
    expect(yoshi.variants.find((variant) => variant.label === 'Rouge')?.takenBy).toBeUndefined();
  });
});
