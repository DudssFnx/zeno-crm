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
        "inline-flex items-center gap-1 rounded-full font-medium",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
        className
      )}
      style={{
        backgroundColor: tag.color,
        color: isLight ? "#1f2937" : "#ffffff",
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
            "rounded-full p-0.5 transition-colors",
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
