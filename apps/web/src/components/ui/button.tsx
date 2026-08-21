import { cn } from "@/lib/cn";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "sm" | "md";
};

const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-[var(--accent-amber)] text-white hover:bg-[var(--accent-amber-hover)] hover:shadow-md hover:-translate-y-0.5 disabled:bg-zinc-300 disabled:translate-y-0 disabled:shadow-none",
  secondary:
    "border border-[var(--border-medium)] bg-white text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-50",
  ghost:
    "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50",
  danger:
    "border border-red-200 bg-red-50 text-[var(--warning)] hover:bg-red-100 disabled:opacity-50",
  success:
    "bg-[var(--success)] text-white hover:brightness-95 disabled:opacity-50",
};

export function Button({
  className,
  variant = "secondary",
  size = "md",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] font-medium transition-[background-color,color,box-shadow,transform] duration-200 disabled:cursor-not-allowed",
        size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-sm",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
