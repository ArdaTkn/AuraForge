import type { ComponentType } from 'react';
import { SECTIONS, SectionId, useAuraStore } from '../state/store';
import { PatternPicker } from './PatternPicker';
import { NodeEditor } from './NodeEditor';
import { PaletteEditor } from './PaletteEditor';
import { SceneGallery } from './SceneGallery';
import { ExportPanel } from './ExportPanel';
import { EngineGroup, FlowGroup, LightGroup, PostGroup, StructureGroup, VolumeGroup } from './groups';

/** Which parameter each section owns, so ⌘K can jump straight to it. */
export const SECTION_CONTENT: Record<SectionId, ComponentType> = {
  scenes: SceneGallery,
  pattern: PatternPicker,
  flow: FlowGroup,
  structure: StructureGroup,
  volume: VolumeGroup,
  palette: PaletteEditor,
  post: () => (
    <>
      <PostGroup />
      <div className="hybrid">
        <span className="hybrid__title">Grade</span>
        <LightGroup />
      </div>
    </>
  ),
  nodes: NodeEditor,
  export: () => (
    <>
      <ExportPanel />
      <div className="hybrid">
        <span className="hybrid__title">Engine</span>
        <EngineGroup />
      </div>
    </>
  ),
};

/**
 * One contextual panel behind the rail. Exactly one subject is on screen at a
 * time, which is what removes the endless two-column scrolling the studio used
 * to have.
 */
export function Panel() {
  const section = useAuraStore((s) => s.section);
  const open = useAuraStore((s) => s.panelOpen);
  const nodeCount = useAuraStore((s) => s.nodes.length);

  if (!open) return null;

  const meta = SECTIONS.find((s) => s.id === section)!;
  const index = SECTIONS.findIndex((s) => s.id === section) + 1;
  const Content = SECTION_CONTENT[section];

  return (
    <aside className="panel">
      <div className="panel__head">
        <span className="panel__title">{meta.label}</span>
        <span className="panel__index">{String(index).padStart(2, '0')}</span>
        <span className="panel__spacer" />
        <span className="panel__hint">
          {section === 'nodes' && nodeCount > 0 ? `${nodeCount} on canvas` : meta.hint}
        </span>
      </div>
      <div className="panel__body" key={section}>
        <Content />
      </div>
    </aside>
  );
}
