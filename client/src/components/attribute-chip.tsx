import { cn } from "@/lib/utils";

interface AttributeChipProps {
  name: string;
  className?: string;
  size?: "xs" | "sm" | "md";
}

export function AttributeChip({ name, className, size = "sm" }: AttributeChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium bg-amber-500 text-white whitespace-nowrap",
        size === "xs" ? "px-1.5 py-0 text-[10px]" : size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
        className
      )}
      title={name}
      data-testid={`chip-attribute-${name}`}
    >
      {name}
    </span>
  );
}
