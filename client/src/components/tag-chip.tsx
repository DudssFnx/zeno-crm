import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tag } from "@shared/schema";

interface TagChipProps {
  tag: Tag;
  onRemove?: () => void;
  className?: string;
  size?: "sm" | "md";
}

export function TagChip({ tag, onRemove, className, size = "sm" }: TagChipProps) {
  const isLight = isLightColor(tag.color);
  
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md font-semibold uppercase tracking-wide shadow-sm",
        size === "sm" ? "px-2.5 py-1 text-[10px]" : "px-3 py-1.5 text-xs",
        className
      )}
      style={{
        backgroundColor: tag.color,
        color: isLight ? "#1f2937" : "#ffffff",
        border: `1px solid ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)'}`,
      }}
    >
      {tag.name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className={cn(
            "rounded p-0.5 transition-colors ml-0.5",
            isLight ? "hover:bg-black/10" : "hover:bg-white/20"
          )}
          data-testid={`button-remove-tag-${tag.id}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

function isLightColor(color: string): boolean {
  const hex = color.replace("#", "");
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 155;
}
