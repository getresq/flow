import { useId, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { X } from 'lucide-react'

import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'

interface InspectorPanelProps {
  title: ReactNode
  description?: ReactNode
  headerContent?: ReactNode
  className?: string
  children: ReactNode
  onClose: () => void
}

export function InspectorPanel({
  title,
  description,
  headerContent,
  className,
  children,
  onClose,
}: InspectorPanelProps) {
  const titleId = useId()
  const descriptionId = useId()

  return (
    <motion.aside
      initial={{ x: 24, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 24, opacity: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      role="complementary"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={cn(
        'pointer-events-auto absolute inset-y-0 right-0 z-50 flex h-full w-full max-w-[440px] flex-col overflow-hidden border-l border-[var(--border-default)] bg-[var(--surface-raised)] shadow-[0_24px_80px_color-mix(in_srgb,var(--surface-primary)_72%,transparent)]',
        className,
      )}
    >
      <header className="border-b border-[var(--border-default)] px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-[var(--text-primary)]">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1 text-sm text-[var(--text-secondary)]">
                {description}
              </p>
            ) : null}
          </div>
          <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>

        {headerContent ? <div className="mt-3">{headerContent}</div> : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </motion.aside>
  )
}
