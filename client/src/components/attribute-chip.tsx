import { cn } from "@/lib/utils";

interface AttributeChipProps {
  name: string;
  className?: string;
  size?: "sm" | "md";
}

export function AttributeChip({ name, className, size = "sm" }: AttributeChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium bg-amber-500 text-white",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
        className
      )}
      data-testid={`chip-attribute-${name}`}
    >
      {name}
    </span>
  );
}
