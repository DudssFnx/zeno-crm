import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Status = "open" | "pending" | "resolved" | "closed";
type AccountStatus = "connected" | "disconnected" | "pending_qr" | "error";

interface StatusBadgeProps {
  status: Status | AccountStatus;
  className?: string;
}

const statusConfig: Record<Status | AccountStatus, { label: string; className: string }> = {
  open: {
    label: "Open",
    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  pending: {
    label: "Pending",
    className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  resolved: {
    label: "Resolved",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  },
  closed: {
    label: "Closed",
    className: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  },
  connected: {
    label: "Connected",
    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  disconnected: {
    label: "Disconnected",
    className: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  },
  pending_qr: {
    label: "Pending QR",
    className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  },
  error: {
    label: "Error",
    className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  
  return (
    <Badge
      variant="secondary"
      className={cn(
        "text-xs font-medium no-default-hover-elevate no-default-active-elevate",
        config.className,
        className
      )}
    >
      {config.label}
    </Badge>
  );
}
