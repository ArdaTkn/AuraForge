import { AuraNode, NODE_KINDS, NodeKind } from '../render/types';
import { useAuraStore } from '../state/store';
import { Icon } from './Icon';
import { Slider } from './Slider';
import { ColorField } from './ColorField';

const KIND_INDEX: Record<string, number> = NODE_KINDS.reduce(
  (acc, k, i) => ({ ...acc, [k.id]: i }),
  {},
);

interface NodeControlsProps {
  node: AuraNode;
  /** the floating canvas card drops the rename field and the coordinate readout */
  compact?: boolean;
}

/**
 * The full editor for one node. Shared by the Nodes panel and the floating
 * card over the canvas, so both always expose exactly the same controls.
 */
export function NodeControls({ node, compact }: NodeControlsProps) {
  const updateNode = useAuraStore((s) => s.updateNode);
  const selectNode = useAuraStore((s) => s.selectNode);
  const duplicateNode = useAuraStore((s) => s.duplicateNode);
  const randomizeNode = useAuraStore((s) => s.randomizeNode);
  const removeNode = useAuraStore((s) => s.removeNode);

  return (
    <>
      {!compact && (
        <input
          className="field"
          value={node.name}
          onChange={(e) => updateNode(node.id, { name: e.target.value }, true)}
          onFocus={() => selectNode(node.id)}
          placeholder="node name"
        />
      )}

      <div className="kind-grid">
        {NODE_KINDS.map((k) => (
          <button
            key={k.id}
            className={`kind${k.id === node.kind ? ' is-active' : ''}`}
            onClick={() => updateNode(node.id, { kind: k.id as NodeKind })}
            title={`${k.label} — ${k.hint}`}
          >
            <span className="kind__glyph">
              <Icon name={k.icon} size={14} />
            </span>
            <span className="kind__label">{k.label}</span>
          </button>
        ))}
      </div>

      <Slider
        label="Strength"
        value={node.strength}
        min={-1}
        max={1}
        onChange={(v) => updateNode(node.id, { strength: v })}
      />
      <Slider
        label="Radius"
        value={node.radius}
        min={0.04}
        max={0.9}
        onChange={(v) => updateNode(node.id, { radius: v })}
      />
      <Slider
        label="Falloff"
        value={node.falloff}
        min={0.4}
        max={6}
        onChange={(v) => updateNode(node.id, { falloff: v })}
      />
      <Slider
        label="Colour Mix"
        value={node.colorMix}
        min={0}
        max={1}
        onChange={(v) => updateNode(node.id, { colorMix: v })}
      />

      <ColorField
        name="Node Colour"
        value={node.color}
        onChange={(hex) => updateNode(node.id, { color: hex })}
      />

      <div className="ncard__actions">
        <button className="btn" onClick={() => duplicateNode(node.id)}>
          <Icon name="duplicate" size={12} /> Duplicate
        </button>
        <button className="btn" onClick={() => randomizeNode(node.id)} title="Reroll kind, drive and colour">
          <Icon name="dice" size={12} /> Reroll
        </button>
      </div>

      <button className="btn btn--danger btn--wide" onClick={() => removeNode(node.id)}>
        <Icon name="trash" size={12} /> Delete this node
      </button>

      <p className="hint">
        {NODE_KINDS[KIND_INDEX[node.kind] ?? 0].hint} · x {node.x.toFixed(3)} · y{' '}
        {node.y.toFixed(3)}
      </p>
    </>
  );
}
