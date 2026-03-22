import { describe, expect, test } from 'bun:test';

import { CodeParserPlugin } from '../src/parser/plugins/code';

describe('CodeParserPlugin', () => {
  test('extracts function/class/interface entities from TS', () => {
    const plugin = new CodeParserPlugin();
    const content = `
export function hello(name: string): string { return 'hello ' + name; }
export class Greeter { greet(name: string) { return hello(name); } }
export interface IGreeter { greet(name: string): string; }
`;
    const entities = plugin.extractEntities(content, 'test.ts');
    const types = entities.map((e) => e.entityType);
    expect(types).toContain('function');
    expect(types).toContain('class');
    expect(types).toContain('interface');
  });
});
