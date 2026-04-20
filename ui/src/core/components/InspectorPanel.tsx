import { useId, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, X } from 'lucide-react';

import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

interface InspectorPanelProps {
  title: ReactNode;
  description?: ReactNode;
  headerContent?: ReactNode;
  className?: string;
  children: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  onClose: () => void;
}

export function InspectorPanel({
  title,
  description,
  headerContent,
  className,
  children,
  onBack,
  backLabel,
  onClose,
}: InspectorPanelProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <motion.aside
      variants={{
        hidden: { x: 32, opacity: 0 },
        visible: {
          x: 0,
          opacity: 1,
          transition: { duration: 0.24, ease: [0.25, 0.1, 0.25, 1] },
        },
        exit: {
          x: 20,
          opacity: 0,
          transition: { duration: 0.16, ease: [0.42, 0, 1, 1] },
        },
      }}
      initial="hidden"
      animate="visible"
      exit="exit"
      role="complementary"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={cn(
        'pointer-events-auto absolute inset-y-0 right-0 z-50 flex h-full w-full max-w-[440px] flex-col overflow-hidden border-l border-[var(--border-default)] bg-[var(--surface-raised)] shadow-[0_24px_80px_color-mix(in_srgb,var(--surface-primary)_72%,transparent)]',
        className,
      )}
    >
      <header className="border-b border-[var(--border-default)] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                aria-label={backLabel ? `Back to ${backLabel}` : 'Back'}
                className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]"
              >
                <ArrowLeft className="size-4" />
                {backLabel ? (
                  <span className="max-w-[140px] truncate text-sm">{backLabel}</span>
                ) : null}
              </button>
            ) : null}
            <h2 id={titleId} className="min-w-0 text-base font-semibold text-[var(--text-primary)]">
              {title}
            </h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </div>

        {description ? (
          <p id={descriptionId} className="mt-1 text-sm text-[var(--text-secondary)]">
            {description}
          </p>
        ) : null}

        {headerContent ? <div className="mt-3">{headerContent}</div> : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </motion.aside>
  );
}
