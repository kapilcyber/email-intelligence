import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type PriorityLabel = "Critical" | "High" | "Medium" | "Low" | "Spam";

const variantMap: Record<PriorityLabel, "error" | "warning" | "success" | "secondary"> = {
  Critical: "error",
  High: "warning",
  Medium: "success",
  Low: "secondary",
  Spam: "secondary",
};

export function PriorityBadge({
  label,
  className,
}: {
  label: string | null | undefined;
  className?: string;
}) {
  if (!label) return <span className="text-neutral-400 dark:text-neutral-500">—</span>;
  const key = label as PriorityLabel;
  const variant = variantMap[key] ?? "secondary";
  return (
    <Badge variant={variant} className={cn("font-normal", className)}>
      {label}
    </Badge>
  );
}
