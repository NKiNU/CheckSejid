import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        neutral: "bg-muted text-muted-foreground",
        success: "bg-primary/10 text-primary",
        warning: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
        destructive: "bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: { variant: "neutral" },
  }
)

// Always give it text: status is never colour-only.
function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>

export { Badge }
