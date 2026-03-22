import { ParserRegistry } from '../registry';
import { CodeParserPlugin } from './code';
import { CsvParserPlugin } from './csv';
import { FallbackParserPlugin } from './fallback';
import { JsonParserPlugin } from './json';
import { MarkdownParserPlugin } from './markdown';
import { TomlParserPlugin } from './toml';
import { YamlParserPlugin } from './yaml';

export function createDefaultRegistry(): ParserRegistry {
  const registry = new ParserRegistry();
  registry.register(new CodeParserPlugin());
  registry.register(new JsonParserPlugin());
  registry.register(new YamlParserPlugin());
  registry.register(new TomlParserPlugin());
  registry.register(new MarkdownParserPlugin());
  registry.register(new CsvParserPlugin());
  registry.register(new FallbackParserPlugin());
  return registry;
}
