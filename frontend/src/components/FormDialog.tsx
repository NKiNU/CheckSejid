import { useState, type FormEvent, type ReactNode } from 'react'
import { useT } from '@/i18n/index.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog.tsx'

// The caller's onSubmit decides when to close (onOpenChange(false)) so a failed submit keeps the form and shows `error`.
export function FormDialog({ open, onOpenChange, title, onSubmit, submitLabel, error, children }: {
  open: boolean
  onOpenChange(open: boolean): void
  title: string
  onSubmit(e: FormEvent<HTMLFormElement>): void | Promise<unknown>
  submitLabel: string
  error?: string | null
  children: ReactNode
}) {
  const { t } = useT()
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>{title}</DialogTitle>
        <form
          onSubmit={async (e) => {
            if (busy) return e.preventDefault()
            setBusy(true)
            try {
              await onSubmit(e)
            } finally {
              setBusy(false)
            }
          }}
          className="grid gap-3"
        >
          {children}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button type="button" variant="outline" className="h-11 px-4">{t('common.cancel')}</Button>
            </DialogClose>
            <Button type="submit" disabled={busy || !open} className="h-11 px-4">{submitLabel}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
