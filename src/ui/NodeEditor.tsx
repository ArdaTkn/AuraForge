import { useState } from 'react';
import { AuraNode, MAX_NODES, NODE_KINDS } from '../render/types';
import { useAuraStore } from '../state/store';
import { Icon } from './Icon';
import { NodeControls } from './NodeControls';
import { Toggle } from './Toggle';

const KIND_INDEX: Record<string, number> = NODE_KINDS.reduce(
  (acc, k, i) => ({ ...acc, [k.id]: i }),
  {},
);

function NodeCard({ node, index }: { node: AuraNode; index: number }) {
  const selected = useAuraStore((s) => s.selectedNode === node.id);
  const selectNode = useAuraStore((s) => s.selectNode);
  const updateNode = useAuraStore((s) => s.updateNode);
  const removeNode = useAuraStore((s) => s.removeNode);
  const [open, setOpen] = useState(false);

  const expanded = open || selected;
  const kind = NODE_KINDS[KIND_INDEX[node.kind] ?? 0];

  return (
    <div className={`ncard${selected ? ' is-selected' : ''}${node.enabled ? '' : ' is-off'}`}>
      <div className="ncard__head">
        <button
          className="ncard__chev"
          onClick={() => setOpen((o) => !o)}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={11} />
        </button>

        <button
          className="ncard__id"
          onClick={() => selectNode(selected ? null : node.id)}
          title="Select on canvas"
        >
          <span className="ncard__glyph" style={{ color: node.color }}>
            <Icon name={kind.icon} size={14} />
          </span>
          <span className="ncard__name">{node.name}</span>
          <span className="ncard__idx">{String(index + 1).padStart(2, '0')}</span>
        </button>

        <Toggle
          checked={node.enabled}
          onChange={(v) => updateNode(node.id, { enabled: v })}
          title={node.enabled ? 'Disable' : 'Enable'}
        />
        <button className="ncard__x" title="Delete node" onClick={() => removeNode(node.id)}>
          <Icon name="close" size={11} />
        </button>
      </div>

      <div className="ncard__meta">
        <span className="ncard__kind">{kind.label}</span>
        <span className="ncard__hint">{kind.hint}</span>
      </div>

      {expanded && (
        <div className="ncard__body">
          <NodeControls node={node} />
        </div>
      )}
    </div>
  );
}

/**
 * Every node is an independent field emitter: its own behaviour, drive,
 * falloff and colour. Nothing here is shared between nodes.
 */
export function NodeEditor() {
  const nodes = useAuraStore((s) => s.nodes);
  const addNode = useAuraStore((s) => s.addNode);
  const clearNodes = useAuraStore((s) => s.clearNodes);
  const brush = useAuraStore((s) => s.brush);
  const setBrush = useAuraStore((s) => s.setBrush);

  return (
    <>
      <div className="split">
        <button
          className="btn btn--primary"
          onClick={() => addNode(0, 0, brush)}
          disabled={nodes.length >= MAX_NODES}
        >
          <Icon name="plus" size={12} /> Add Node
        </button>
        <button className="btn" onClick={clearNodes} disabled={nodes.length === 0}>
          Clear All
        </button>
      </div>

      <div className="ctl__head">
        <span className="ctl__label">Brush for the next node</span>
        <span className="ctl__value">{NODE_KINDS.find((k) => k.id === brush)?.label}</span>
      </div>

      <div className="kind-grid kind-grid--tight">
        {NODE_KINDS.map((k) => (
          <button
            key={k.id}
            className={`kind${k.id === brush ? ' is-active' : ''}`}
            onClick={() => setBrush(k.id)}
            title={`${k.label} — ${k.hint}`}
          >
            <span className="kind__glyph">
              <Icon name={k.icon} size={14} />
            </span>
          </button>
        ))}
      </div>

      {nodes.length === 0 ? (
        <p className="empty">
          No nodes yet. Double click the canvas to drop one, or hit <b>+ Add Node</b>.
        </p>
      ) : (
        <div className="nlist">
          {nodes.map((n, i) => (
            <NodeCard key={n.id} node={n} index={i} />
          ))}
        </div>
      )}

      <p className="hint">
        {nodes.length}/{MAX_NODES} nodes · drag on canvas to move · right click to delete
      </p>
    </>
  );
}
