'use client';

import type {
  ExpansionDirections,
  FileDiffOptions,
  HunkData,
  HunkSeparators,
} from '@pierre/diffs';
import { FileDiff } from '@pierre/diffs';
import { MultiFileDiff } from '@pierre/diffs/react';
import type { PreloadMultiFileDiffResult } from '@pierre/diffs/ssr';
import { useEffect, useMemo, useRef, useState } from 'react';

import { FeatureHeader } from '../FeatureHeader';
import styles from './CustomHunkSeparators.module.css';
import { ButtonGroup, ButtonGroupItem } from '@/components/ui/button-group';

type PrebuiltHunkSeparator = Exclude<HunkSeparators, 'custom'>;
type HunkSeparatorOption = PrebuiltHunkSeparator | 'custom';

const SEPARATOR_OPTIONS: {
  value: HunkSeparatorOption;
  label: string;
}[] = [
  { value: 'line-info', label: 'Line Info' },
  { value: 'line-info-basic', label: 'Line Info Basic' },
  { value: 'metadata', label: 'Metadata' },
  { value: 'simple', label: 'Simple' },
  { value: 'custom', label: 'Custom' },
];

function isPrebuiltHunkSeparator(
  value: unknown
): value is PrebuiltHunkSeparator {
  return SEPARATOR_OPTIONS.some(
    (option): option is { value: PrebuiltHunkSeparator; label: string } =>
      option.value !== 'custom' && option.value === value
  );
}

function isHunkSeparatorOption(value: unknown): value is HunkSeparatorOption {
  return SEPARATOR_OPTIONS.some((option) => option.value === value);
}

function createControl(
  direction: ExpansionDirections,
  onExpand: (direction: ExpansionDirections) => void,
  labelText?: string
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = styles.customSeparatorButton;
  button.ariaLabel =
    direction === 'up'
      ? 'Expand up'
      : direction === 'down'
        ? 'Expand down'
        : 'Expand up and down';
  const icon = document.createElement('span');
  icon.className = styles.customSeparatorIcon;
  icon.textContent =
    direction === 'up' ? '↓' : direction === 'down' ? '↑' : '↕';
  button.appendChild(icon);
  if (labelText != null) {
    const label = document.createElement('span');
    label.className = styles.customSeparatorLabel;
    label.textContent = labelText;
    button.appendChild(label);
  }
  button.addEventListener('click', () => onExpand(direction));
  return button;
}

function createCustomSeparator(
  hunkData: HunkData,
  instance: FileDiff<undefined>
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = styles.customSeparatorWrapper;

  const element = document.createElement('div');
  element.className = styles.customSeparatorRoot;

  if (hunkData.type === 'additions') {
    const spacer = document.createElement('span');
    spacer.textContent = ' ';
    wrapper.appendChild(spacer);
    wrapper.appendChild(element);
    return wrapper;
  }

  const controls = document.createElement('div');
  controls.className = styles.customSeparatorControls;

  const canExpandUp = hunkData.expandable?.up === true;
  const canExpandDown = hunkData.expandable?.down === true;
  const lineLabel = hunkData.lines === 1 ? 'line' : 'lines';
  const labelText = `${hunkData.lines} unmodified ${lineLabel}`;

  if (canExpandUp && canExpandDown) {
    controls.appendChild(
      createControl(
        'both',
        (direction) => {
          instance.expandHunk(hunkData.hunkIndex, direction);
        },
        labelText
      )
    );
  } else if (canExpandUp) {
    controls.appendChild(
      createControl(
        'up',
        (direction) => {
          instance.expandHunk(hunkData.hunkIndex, direction);
        },
        labelText
      )
    );
  } else if (canExpandDown) {
    controls.appendChild(
      createControl(
        'down',
        (direction) => {
          instance.expandHunk(hunkData.hunkIndex, direction);
        },
        labelText
      )
    );
  }

  element.appendChild(controls);
  const expandAll = document.createElement('button');
  expandAll.type = 'button';
  expandAll.className = styles.customExpandAllButton;
  expandAll.textContent = 'Expand all';
  expandAll.addEventListener('click', () => {
    instance.expandAllHunks();
  });
  element.appendChild(expandAll);
  const spacer = document.createElement('span');
  spacer.textContent = ' ';
  wrapper.appendChild(spacer);
  wrapper.appendChild(element);
  return wrapper;
}

interface CustomHunkSeparatorsProps {
  prerenderedDiff: PreloadMultiFileDiffResult<undefined>;
  showHeader?: boolean;
}

export function CustomHunkSeparators({
  prerenderedDiff,
  showHeader = true,
}: CustomHunkSeparatorsProps) {
  const customContainerRef = useRef<HTMLDivElement>(null);
  const initialSeparator = useMemo<PrebuiltHunkSeparator>(() => {
    const separator = prerenderedDiff.options?.hunkSeparators;
    return isPrebuiltHunkSeparator(separator) ? separator : 'line-info';
  }, [prerenderedDiff.options?.hunkSeparators]);

  const [hunkSeparators, setHunkSeparators] =
    useState<HunkSeparatorOption>(initialSeparator);

  useEffect(() => {
    if (hunkSeparators !== 'custom') {
      return;
    }
    const container = customContainerRef.current;
    if (
      container == null ||
      prerenderedDiff.oldFile == null ||
      prerenderedDiff.newFile == null
    ) {
      return;
    }

    const options: FileDiffOptions<undefined> = {
      ...(prerenderedDiff.options ?? {}),
      hunkSeparators: (hunkData, instance) =>
        createCustomSeparator(hunkData, instance),
    };
    const instance = new FileDiff(options);

    instance.render({
      oldFile: prerenderedDiff.oldFile,
      newFile: prerenderedDiff.newFile,
      lineAnnotations: prerenderedDiff.annotations,
      containerWrapper: container,
    });

    return () => {
      instance.cleanUp();
      container.innerHTML = '';
    };
  }, [
    hunkSeparators,
    prerenderedDiff.annotations,
    prerenderedDiff.newFile,
    prerenderedDiff.oldFile,
    prerenderedDiff.options,
  ]);

  return (
    <div className="space-y-4">
      {showHeader && (
        <FeatureHeader
          title="Custom hunk separators"
          description="Swap between the prebuilt hunk separator styles to preview how collapsed chunks are displayed."
        />
      )}

      <ButtonGroup
        value={hunkSeparators}
        onValueChange={(value) => {
          if (isHunkSeparatorOption(value)) {
            setHunkSeparators(value);
          }
        }}
      >
        {SEPARATOR_OPTIONS.map((option) => (
          <ButtonGroupItem key={option.value} value={option.value}>
            {option.label}
          </ButtonGroupItem>
        ))}
      </ButtonGroup>

      {hunkSeparators === 'custom' ? (
        <div
          ref={customContainerRef}
          className="overflow-hidden rounded-lg border dark:border-neutral-800"
        />
      ) : (
        <MultiFileDiff
          {...prerenderedDiff}
          prerenderedHTML={
            hunkSeparators === initialSeparator
              ? prerenderedDiff.prerenderedHTML
              : undefined
          }
          className="overflow-hidden rounded-lg border dark:border-neutral-800"
          options={{
            ...prerenderedDiff.options,
            hunkSeparators,
          }}
        />
      )}
    </div>
  );
}
