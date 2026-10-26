import { useT } from '@/i18n/index.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog.tsx'

export function ConfirmDialog({ open, onOpenChange, title, body, confirmLabel, destructive, onConfirm }: {
  open: boolean
  onOpenChange(open: boolean): void
  title: string
  body: string
  confirmLabel: string
  destructive?: boolean
  onConfirm(): void
}) {
  const { t } = useT()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{body}</DialogDescription>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogClose asChild>
            <Button variant="outline" className="h-11 px-4">{t('common.cancel')}</Button>
          </DialogClose>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            className="h-11 px-4"
            onClick={() => {
              onConfirm()
              onOpenChange(false)
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
