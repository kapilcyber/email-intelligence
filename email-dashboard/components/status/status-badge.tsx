import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusVariant = "active" | "expiring" | "error" | "stored" | "failed";

const variantMap: Record<StatusVariant, "success" | "warning" | "error" | "secondary"> = {
  active: "success",
  expiring: "warning",
  error: "error",
  stored: "success",
  failed: "error",
};

export function StatusBadge({ status, className }: { status: StatusVariant; className?: string }) {
  const variant = variantMap[status] ?? "secondary";
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <Badge variant={variant} className={cn("font-normal", className)}>
      {label}
    </Badge>
  );
}
