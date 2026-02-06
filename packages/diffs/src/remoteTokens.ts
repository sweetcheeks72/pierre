import type {
  Awaitable,
  FileContents,
  FileDiffMetadata,
  ForceDiffPlainTextOptions,
  ForceFilePlainTextOptions,
  LineTypes,
  RenderDiffOptions,
  RenderFileOptions,
  ThemeTypes,
} from './types';

/**
 * Versioned schema for incoming remote token frames.
 * Bump this whenever the frame contract changes in a breaking way.
 */
export const REMOTE_TOKEN_PROTOCOL_VERSION = 1 as const;

export interface RemoteTokenSource {
  /**
   * Provider identifier (for example: "github", "gitlab", "my-storage").
   */
  provider: string;
  /**
   * Stable source identity. This should remain stable for all frames in the
   * same stream.
   */
  resourceId: string;
  /**
   * Optional revision identity (commit SHA, blob version, etc.).
   */
  revision?: string;
  /**
   * Optional content hash for integrity checks.
   */
  contentHash?: string;
}

export interface RemoteThemeMetadata {
  /**
   * CSS variable / theme styles compatible with diffs pre/header rendering.
   */
  themeStyles?: string;
  /**
   * Optional tokenizer-scoped CSS (for example custom tag selectors).
   */
  tokenizerStyles?: string;
  /**
   * Optional base theme mode used by pre/header nodes.
   */
  baseThemeType?: Exclude<ThemeTypes, 'system'>;
}

export interface RemoteRenderedToken {
  content: string;
  className?: string | string[];
  style?: string;
  color?: string;
}

export interface RemoteFileTokenLine {
  lineIndex: number;
  tokens: RemoteRenderedToken[];
  lineType?: Extract<LineTypes, 'context' | 'context-expanded'>;
}

export interface RemoteDiffTokenLine {
  side: 'additions' | 'deletions';
  lineIndex: number;
  tokens: RemoteRenderedToken[];
  lineType?: LineTypes;
}

export interface RemoteTokenFrameBase {
  protocolVersion: typeof REMOTE_TOKEN_PROTOCOL_VERSION;
  /**
   * Stream identity. Must remain stable for the full stream.
   */
  streamId: string;
  /**
   * Monotonic sequence number used for ordering and idempotency.
   * Sequence numbers are expected to start at 0.
   */
  sequence: number;
  source: RemoteTokenSource;
  theme?: RemoteThemeMetadata;
  /**
   * Marks the final frame for this stream.
   */
  done?: boolean;
}

export interface RemoteFileTokenFrame extends RemoteTokenFrameBase {
  kind: 'file';
  lines: RemoteFileTokenLine[];
}

export interface RemoteDiffTokenFrame extends RemoteTokenFrameBase {
  kind: 'diff';
  lines: RemoteDiffTokenLine[];
}

export interface RemoteFileTokenRequest {
  file: FileContents;
  options: RenderFileOptions;
  renderOptions?: Partial<ForceFilePlainTextOptions>;
}

export interface RemoteDiffTokenRequest {
  diff: FileDiffMetadata;
  options: RenderDiffOptions;
  renderOptions?: Partial<ForceDiffPlainTextOptions>;
}

/**
 * Transport contract for third-party remote token providers.
 * Providers may yield frames out of order and may resend prior sequence numbers.
 * Consumers should dedupe by `streamId + sequence` and reconstruct ordered
 * output before rendering.
 */
export interface RemoteTokenTransport {
  streamFileTokens(
    request: RemoteFileTokenRequest
  ): Awaitable<AsyncIterable<RemoteFileTokenFrame>>;
  streamDiffTokens(
    request: RemoteDiffTokenRequest
  ): Awaitable<AsyncIterable<RemoteDiffTokenFrame>>;
}
