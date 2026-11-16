import { describe, expect, it } from 'vitest';
import type { FloorTab } from './floor-tabs';
import { floorBarModel } from './floors';

const tabs: FloorTab[] = [
  { id: '', name: 'Térreo', agents: 2, working: 1, waiting: 0 },
  { id: 'g', name: 'g', agents: 3, working: 2, waiting: 1 },
  { id: 'h', name: 'h', agents: 1, working: 0, waiting: 0 },
];

describe('floorBarModel', () => {
  it('monta um botão por andar com nome, contagem e o atual marcado', () => {
    const m = floorBarModel(tabs, 'g');
    expect(m).toEqual([
      { id: '', label: 'Térreo', count: '2', waiting: false, active: false },
      { id: 'g', label: 'g', count: '3', waiting: true, active: true },
      { id: 'h', label: 'h', count: '1', waiting: false, active: false },
    ]);
  });
  it('waiting só quando o andar tem agente esperando o dono', () => {
    expect(floorBarModel(tabs, '').map((b) => b.waiting)).toEqual([false, true, false]);
  });
  it('sem tabs devolve lista vazia', () => {
    expect(floorBarModel([], 'g')).toEqual([]);
  });
  it('andar atual que não está nas abas não marca nenhum botão', () => {
    expect(floorBarModel(tabs, 'sumiu').some((b) => b.active)).toBe(false);
  });
});
