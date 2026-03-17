import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:ring-offset-2 focus:ring-offset-[var(--surface-raised)]',
  {
    variants: {
      variant: {
        default:
          'border-[var(--border-accent)] bg-[var(--accent-primary-muted)] text-[var(--accent-primary)]',
        secondary:
          'border-[var(--border-default)] bg-[var(--surface-overlay)] text-[var(--text-primary)]',
        destructive:
          'border-[var(--status-error)] text-[var(--status-error)] [background-color:color-mix(in_srgb,var(--status-error)_16%,transparent)]',
        outline: 'border-[var(--border-default)] text-[var(--text-primary)]',
        success:
          'border-[var(--status-success)] text-[var(--status-success)] [background-color:color-mix(in_srgb,var(--status-success)_16%,transparent)]',
        warning:
          'border-[var(--status-warning)] text-[var(--status-warning)] [background-color:color-mix(in_srgb,var(--status-warning)_16%,transparent)]',
        stuck:
          'animate-flow-pulse border-[var(--status-warning)] text-[var(--status-warning)] [background-color:color-mix(in_srgb,var(--status-warning)_16%,transparent)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

type BadgeProps = React.ComponentProps<'div'> & VariantProps<typeof badgeVariants>

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
