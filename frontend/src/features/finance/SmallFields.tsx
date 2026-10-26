import { useT } from '@/i18n/index.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Select } from '@/components/ui/select.tsx'
import { Textarea } from '@/components/ui/textarea.tsx'

const field = 'grid min-w-0 gap-2'

export function CategoryFields() {
  const { t } = useT()
  return (
    <>
      <div className={field}>
        <Label htmlFor="fin-catname">{t('fin.categoryName')}</Label>
        <Input id="fin-catname" name="name" className="h-11" required maxLength={100} />
      </div>
      <div className={field}>
        <Label htmlFor="fin-catkind">{t('fin.categoryKind')}</Label>
        <Select id="fin-catkind" name="kind" defaultValue="EXPENSE">
          <option value="EXPENSE">{t('cat.EXPENSE')}</option>
          <option value="INCOME">{t('cat.INCOME')}</option>
        </Select>
      </div>
    </>
  )
}

export function CollectionFields() {
  const { t } = useT()
  return (
    <>
      <div className={field}>
        <Label htmlFor="fin-purpose">{t('fin.purpose')}</Label>
        <Input id="fin-purpose" name="purpose" className="h-11" required maxLength={200} />
      </div>
      <div className={field}>
        <Label htmlFor="fin-target">{t('fin.target')}</Label>
        <Input id="fin-target" name="target" className="h-11" inputMode="decimal" />
      </div>
    </>
  )
}

export function ReasonField() {
  const { t } = useT()
  return (
    <div className={field}>
      <Label htmlFor="fin-reason">{t('fin.reason')}</Label>
      <Textarea id="fin-reason" name="reason" required rows={3} maxLength={500} />
    </div>
  )
}
