import { cn } from "@/lib/cn";

type BadgeProps = {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
  className?: string;
};

const tones: Record<NonNullable<BadgeProps["tone"]>, string> = {
  neutral: "bg-[var(--bg-hover)] text-[var(--text-secondary)]",
  success: "bg-emerald-50 text-[var(--success)]",
  warning: "bg-[var(--accent-amber-soft)] text-[var(--accent-amber-hover)]",
  danger: "bg-red-50 text-[var(--warning)]",
};

export function Badge({ children, tone = "neutral", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[var(--radius-sm)] px-2 py-0.5 text-[11px] font-semibold",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
