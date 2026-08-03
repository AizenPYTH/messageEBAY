import { cn } from "@/lib/cn";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-accent text-accent-fg hover:bg-zinc-800 disabled:bg-zinc-400",
  secondary:
    "border border-border bg-card text-foreground hover:bg-muted-bg disabled:opacity-50",
  ghost: "text-muted hover:bg-muted-bg hover:text-foreground disabled:opacity-50",
  danger:
    "border border-red-200 bg-red-50 text-danger hover:bg-red-100 disabled:opacity-50",
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
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed",
        size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
