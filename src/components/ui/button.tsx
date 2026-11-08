import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const button = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-md)] font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 select-none",
  {
    variants: {
      variant: {
        primary:
          "bg-ink text-ground shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_1px_2px_rgba(0,0,0,0.3)] hover:bg-[#fffdf7]",
        secondary:
          "border border-border bg-raised text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:bg-hover hover:border-border-strong",
        ghost: "text-ink-2 hover:bg-hover hover:text-ink",
        annot: "bg-annot text-ground hover:bg-[#8fb3df]",
        danger: "border border-down/40 text-down hover:bg-down-dim",
      },
      size: {
        sm: "h-9 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {
  asChild?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild,
  type = "button",
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(button({ variant, size }), className)}
      type={asChild ? undefined : type}
      {...props}
    />
  );
}

export { button as buttonVariants };
