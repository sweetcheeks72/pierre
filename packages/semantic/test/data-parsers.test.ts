import { describe, expect, test } from 'bun:test';

import { CsvParserPlugin } from '../src/parser/plugins/csv';
import { FallbackParserPlugin } from '../src/parser/plugins/fallback';
import { JsonParserPlugin } from '../src/parser/plugins/json';
import { MarkdownParserPlugin } from '../src/parser/plugins/markdown';
import { TomlParserPlugin } from '../src/parser/plugins/toml';
import { YamlParserPlugin } from '../src/parser/plugins/yaml';

describe('Data parsers', () => {
  test('JSON: extracts keys as entities', () => {
    const plugin = new JsonParserPlugin();
    const content = JSON.stringify({
      name: 'Alice',
      age: 30,
      address: { city: 'NY' },
    });
    const entities = plugin.extractEntities(content, 'config.json');
    expect(entities.length).toBeGreaterThan(0);

    // Should extract top-level properties
    const names = entities.map((e) => e.name);
    expect(names).toContain('name');
    expect(names).toContain('age');
    expect(names).toContain('address');
  });

  test('YAML: extracts keys as entities', () => {
    const plugin = new YamlParserPlugin();
    const content = 'name: Bob\nage: 25\nskills:\n  - ts\n  - go';
    const entities = plugin.extractEntities(content, 'config.yaml');
    expect(entities.length).toBeGreaterThan(0);

    // Should extract keys
    const names = entities.map((e) => e.name);
    expect(names).toContain('name');
    expect(names).toContain('age');
    expect(names).toContain('skills');
  });

  test('Markdown: extracts headings as entities', () => {
    const plugin = new MarkdownParserPlugin();
    const content = '# Title\n\n## Section One\n\nsome text\n\n## Section Two';
    const entities = plugin.extractEntities(content, 'README.md');
    expect(entities.length).toBeGreaterThan(0);

    // Should extract headings
    const names = entities.map((e) => e.name);
    expect(names).toContain('Title');
    expect(names).toContain('Section One');
    expect(names).toContain('Section Two');
  });

  test('TOML: extracts sections and keys', () => {
    const plugin = new TomlParserPlugin();
    const content = 'title = "Test"\n\n[section]\nkey = "value"';
    const entities = plugin.extractEntities(content, 'config.toml');
    expect(entities.length).toBeGreaterThan(0);

    // Should extract top-level keys and sections
    const names = entities.map((e) => e.name);
    expect(names).toContain('title');
    expect(names).toContain('section');
  });

  test('CSV: extracts rows as entities', () => {
    const plugin = new CsvParserPlugin();
    const content = 'name,age\nAlice,30\nBob,25';
    const entities = plugin.extractEntities(content, 'data.csv');
    expect(entities.length).toBe(2); // Two data rows

    // Each row should have metadata with parsed values
    expect(entities[0].metadata).toBeDefined();
    expect(entities[0].metadata?.name).toBe('Alice');
    expect(entities[0].metadata?.age).toBe('30');
  });

  test('Fallback: chunks lines', () => {
    const plugin = new FallbackParserPlugin();
    const content = Array(50).fill('line').join('\n');
    const entities = plugin.extractEntities(content, 'unknown.txt');

    // Should create chunks (50 lines / 20 per chunk = 3 chunks)
    expect(entities.length).toBe(3);
    expect(entities[0].entityType).toBe('chunk');
  });
});
