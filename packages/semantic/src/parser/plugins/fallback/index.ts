import type { SemanticEntity } from '../../../model/entity';
import { buildEntityId } from '../../../model/entity';
import { contentHash } from '../../../utils/hash';
import type { SemanticParserPlugin } from '../../plugin';

export class FallbackParserPlugin implements SemanticParserPlugin {
  id = 'fallback';
  extensions: string[] = []; // Matches everything as default

  extractEntities(content: string, filePath: string): SemanticEntity[] {
    const lines = content.split('\n');
    const entities: SemanticEntity[] = [];

    // Group lines into chunks of ~20 for meaningful diffing
    const CHUNK_SIZE = 20;

    for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
      const chunk = lines.slice(i, Math.min(i + CHUNK_SIZE, lines.length));
      const chunkContent = chunk.join('\n');
      const startLine = i + 1;
      const endLine = Math.min(i + CHUNK_SIZE, lines.length);
      const name = `lines ${startLine}-${endLine}`;

      entities.push({
        id: buildEntityId(filePath, 'chunk', name),
        filePath,
        entityType: 'chunk',
        name,
        content: chunkContent,
        contentHash: contentHash(chunkContent),
        startLine,
        endLine,
      });
    }

    return entities;
  }
}
