import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  badge?: React.ReactNode;
  className?: string;
}

export function MetricCard({ title, value, subtitle, badge, className }: MetricCardProps) {
  return (
    <Card className={cn("rounded-2xl shadow-sm", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <span className="text-sm font-medium text-neutral-500 dark:text-neutral-400">{title}</span>
        {badge}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{value}</div>
        {subtitle && (
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}
