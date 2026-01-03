interface EdgeLineProps {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  label?: string;
  selected?: boolean;
  onClick?: () => void;
}

export function EdgeLine({ fromX, fromY, toX, toY, label, selected, onClick }: EdgeLineProps) {
  const midX = (fromX + toX) / 2;
  const dx = Math.abs(toX - fromX);
  const controlOffset = Math.min(dx * 0.5, 100);
  
  const path = `M ${fromX} ${fromY} C ${fromX + controlOffset} ${fromY}, ${toX - controlOffset} ${toY}, ${toX} ${toY}`;
  
  return (
    <g onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <path
        d={path}
        fill="none"
        stroke={selected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
        strokeWidth={selected ? 2.5 : 2}
        strokeOpacity={selected ? 1 : 0.5}
        className="transition-all duration-150"
      />
      {onClick && (
        <path
          d={path}
          fill="none"
          stroke="transparent"
          strokeWidth={16}
        />
      )}
      {label && (
        <text
          x={midX}
          y={(fromY + toY) / 2 - 8}
          textAnchor="middle"
          className="text-xs fill-muted-foreground"
        >
          {label}
        </text>
      )}
      <circle
        cx={toX}
        cy={toY}
        r={4}
        fill={selected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
      />
    </g>
  );
}
