import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-xs font-medium whitespace-nowrap transition-all duration-150 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/25 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-emerald-700 dark:hover:bg-emerald-400",
        outline:
          "border-border bg-card text-foreground shadow-2xs hover:border-slate-300 hover:bg-secondary/75 dark:hover:border-slate-700",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-slate-200/75 dark:hover:bg-slate-800",
        ghost:
          "hover:bg-secondary hover:text-accent-foreground",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 gap-1.5 px-3.5 py-2",
        xs: "h-7 gap-1 rounded-md px-2.5 text-[11px] [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 text-xs",
        lg: "h-10 gap-2 rounded-lg px-5 text-sm font-semibold",
        icon: "size-9",
        "icon-xs": "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-8 rounded-md",
        "icon-lg": "size-10 rounded-lg [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
