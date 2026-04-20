import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors outline-none disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-raised)] [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--accent-primary)] text-[var(--surface-primary)] hover:bg-[var(--accent-primary-hover)]',
        destructive: 'bg-[var(--status-error)] text-[var(--surface-primary)] hover:opacity-90',
        outline:
          'border border-[var(--border-default)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-overlay)]',
        secondary: 'bg-[var(--surface-overlay)] text-[var(--text-primary)] hover:opacity-90',
        ghost:
          'text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]',
        hud: 'text-[var(--text-primary)] hover:bg-[var(--surface-overlay)]',
        link: 'text-[var(--accent-primary)] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-3 py-1.5',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-10 px-4',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';

    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
