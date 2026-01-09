import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useAuthFetch } from "@/lib/auth";
import type { ContactAttribute, ContactAttributeCount } from "@shared/schema";

interface AttributeChipProps {
  name: string;
  contactId?: string;
  count?: number;
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

export function AttributeChip({ name, contactId, count, className, size = "sm" }: AttributeChipProps) {
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
  
  // Fetch attribute counts for this contact if contactId is provided AND count not already supplied
  // Skip fetch when count prop is provided (performance optimization)
  const shouldFetchCounts = !!contactId && count === undefined;
  const { data: attributeCounts = [] } = useQuery<ContactAttributeCount[]>({
    queryKey: ["/api/contacts", contactId, "attribute-counts"],
    queryFn: async () => {
      if (!contactId) return [];
      const res = await authFetch(`/api/contacts/${contactId}/attribute-counts`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: shouldFetchCounts,
    staleTime: 1000 * 60 * 2, // Cache for 2 minutes
  });
  
  const attribute = attributes.find(a => a.name === name);
  const color = attribute?.color || "#6366f1";
  const isLight = isLightColor(color);
  
  // Get count from API or use provided count prop
  const attrCount = attributeCounts.find(c => c.attributeName === name);
  const effectiveCount = count ?? attrCount?.count ?? 1;
  
  // Display name with count if count > 1
  const displayText = effectiveCount > 1 ? `${name} (${effectiveCount})` : name;
  
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
      title={displayText}
      data-testid={`chip-attribute-${name}`}
    >
      {displayText}
    </span>
  );
}
