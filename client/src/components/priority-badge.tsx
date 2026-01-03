import { Badge } from "@/components/ui/badge";
import { Clock, AlertTriangle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type PriorityLevel = "none" | "normal" | "high" | "urgent";

interface PriorityBadgeProps {
  level: PriorityLevel;
  className?: string;
}

export function getPriorityLevel(
  lastInboundAt: string | Date | null | undefined,
  lastOutboundAt: string | Date | null | undefined,
  lastMessageDirection?: "incoming" | "outgoing"
): PriorityLevel {
  if (!lastInboundAt) return "none";
  
  const lastInbound = lastInboundAt instanceof Date 
    ? lastInboundAt.getTime() 
    : new Date(lastInboundAt).getTime();
  const lastOutbound = lastOutboundAt 
    ? (lastOutboundAt instanceof Date ? lastOutboundAt.getTime() : new Date(lastOutboundAt).getTime()) 
    : 0;
  
  if (lastOutbound > lastInbound) {
    return "none";
  }
  
  const now = Date.now();
  const hoursSinceInbound = (now - lastInbound) / (1000 * 60 * 60);
  
  if (hoursSinceInbound >= 3) return "urgent";
  if (hoursSinceInbound >= 2) return "high";
  if (hoursSinceInbound >= 1) return "normal";
  
  return "none";
}

export function PriorityBadge({ level, className }: PriorityBadgeProps) {
  if (level === "none") return null;

  const config = {
    normal: {
      label: "Prioridade",
      icon: Clock,
      className: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
    },
    high: {
      label: "Alta",
      icon: AlertTriangle,
      className: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
    },
    urgent: {
      label: "Urgente",
      icon: AlertCircle,
      className: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30 animate-pulse",
    },
  };

  const { label, icon: Icon, className: badgeClass } = config[level];

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[9px] px-1.5 py-0 h-4 font-medium gap-0.5 no-default-hover-elevate no-default-active-elevate",
        badgeClass,
        className
      )}
      data-testid={`badge-priority-${level}`}
    >
      <Icon className="h-2.5 w-2.5" />
      {label}
    </Badge>
  );
}
