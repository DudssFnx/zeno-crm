import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useAuthFetch } from "@/lib/auth";
import type { ContactAttribute } from "@shared/schema";

interface AttributeChipProps {
  name: string;
  className?: string;
  size?: "xs" | "sm" | "md";
}

function isLightColor(color: string): boolean {
  const hex = color.replace("#", "");
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 155;
}

export function AttributeChip({ name, className, size = "sm" }: AttributeChipProps) {
  const authFetch = useAuthFetch();
  
  const { data: attributes = [] } = useQuery<ContactAttribute[]>({
    queryKey: ["/api/contact-attributes"],
    queryFn: async () => {
      const res = await authFetch("/api/contact-attributes");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
  
  const attribute = attributes.find(a => a.name === name);
  const color = attribute?.color || "#6366f1";
  const isLight = isLightColor(color);
  
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md font-semibold uppercase tracking-wide whitespace-nowrap shrink-0 shadow-sm",
        size === "xs" ? "px-1.5 py-0.5 text-[9px]" : size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
        className
      )}
      style={{
        backgroundColor: color,
        color: isLight ? "#1f2937" : "#ffffff",
        border: `1px solid ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)'}`,
      }}
      title={name}
      data-testid={`chip-attribute-${name}`}
    >
      {name}
    </span>
  );
}
