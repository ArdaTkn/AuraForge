import { AuraNode, NODE_KINDS } from '../render/types';
import { useAuraStore } from '../state/store';
import { Icon } from './Icon';
import { NodeControls } from './NodeControls';
import { Toggle } from './Toggle';

const KIND_INDEX: Record<string, number> = NODE_KINDS.reduce(
  (acc, k, i) => ({ ...acc, [k.id]: i }),
  {},
);

interface NodeHudProps {
  node: AuraNode;
  /** gizmo position in stage pixels */
  px: number;
  py: number;
  /** stage size in pixels */
  width: number;
  height: number;
}

const CARD_W = 250;
const CARD_H = 300;

/**
 * The floating editor that follows the selected node on the canvas. It stays
 * inside the stage and flips to whichever side has room, so it never covers
 * the effect you are adjusting.
 */
export function NodeHud({ node, px, py, width, height }: NodeHudProps) {
  const updateNode = useAuraStore((s) => s.updateNode);
  const selectNode = useAuraStore((s) => s.selectNode);

  const rightRoom = width - px;
  const openLeft = rightRoom < CARD_W + 30;

  const left = openLeft ? px - CARD_W - 22 : px + 22;
  const top = Math.max(8, Math.min(py - 40, height - CARD_H - 8));

  const kind = NODE_KINDS[KIND_INDEX[node.kind] ?? 0];

  return (
    <div
      className="node-hud"
      style={{ left: Math.max(8, Math.min(left, width - CARD_W - 8)), top }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="node-hud__head">
        <span className="node-hud__glyph" style={{ color: node.color }}>
          <Icon name={kind.icon} size={14} />
        </span>
        <span className="node-hud__name">{node.name}</span>
        <Toggle
          checked={node.enabled}
          onChange={(v) => updateNode(node.id, { enabled: v })}
          title={node.enabled ? 'Disable' : 'Enable'}
        />
        <button className="ncard__x" title="Close" onClick={() => selectNode(null)}>
          <Icon name="close" size={11} />
        </button>
      </div>
      <div className="node-hud__body">
        <NodeControls node={node} compact />
      </div>
    </div>
  );
}
