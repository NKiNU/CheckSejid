import { useT } from '@/i18n/index.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Select } from '@/components/ui/select.tsx'
import * as api from './api.ts'

const field = 'grid min-w-0 gap-2'

export function TransactionFields({ kind, categories, collections }: { kind: api.Kind; categories: api.Category[]; collections: api.Collection[] }) {
  const { t } = useT()
  const catKind = kind === 'income' ? 'INCOME' : 'EXPENSE'
  return (
    <>
      {kind === 'budget' && (
        <div className={field}>
          <Label htmlFor="fin-name">{t('fin.budgetName')}</Label>
          <Input id="fin-name" name="name" className="h-11" required maxLength={200} />
        </div>
      )}
      <div className={field}>
        <Label htmlFor="fin-amount">{t('fin.amount')}</Label>
        <Input id="fin-amount" name="amount" className="h-11" required inputMode="decimal" />
      </div>
      <div className={field}>
        <Label htmlFor="fin-cat">{t('fin.category')}</Label>
        <Select id="fin-cat" name="categoryId" required defaultValue="">
          <option value="" disabled>
            {t('fin.category')}
          </option>
          {categories
            .filter((c) => c.kind === catKind && c.active)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </Select>
      </div>
      {kind === 'budget' ? (
        <>
          <div className={field}>
            <Label htmlFor="fin-start">{t('fin.periodStart')}</Label>
            <Input id="fin-start" name="periodStart" type="date" className="h-11" required />
          </div>
          <div className={field}>
            <Label htmlFor="fin-end">{t('fin.periodEnd')}</Label>
            <Input id="fin-end" name="periodEnd" type="date" className="h-11" required />
          </div>
        </>
      ) : (
        <div className={field}>
          <Label htmlFor="fin-date">{t('fin.date')}</Label>
          <Input id="fin-date" name="date" type="date" className="h-11" required />
        </div>
      )}
      {kind === 'expense' && (
        <div className={field}>
          <Label htmlFor="fin-payee">{t('fin.payee')}</Label>
          <Input id="fin-payee" name="payee" className="h-11" maxLength={200} />
        </div>
      )}
      {kind === 'income' && (
        <div className={field}>
          <Label htmlFor="fin-col">{t('fin.collection')}</Label>
          <Select id="fin-col" name="collectionId" defaultValue="">
            <option value="">{t('fin.noCollection')}</option>
            {collections
              .filter((c) => c.status === 'OPEN')
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.purpose}
                </option>
              ))}
          </Select>
        </div>
      )}
      <div className={field}>
        <Label htmlFor="fin-desc">{t('common.description')}</Label>
        <Input id="fin-desc" name="description" className="h-11" required maxLength={1000} />
      </div>
      {kind === 'expense' && (
        <div className={field}>
          <Label htmlFor="fin-receipt" className="leading-snug">{t('fin.receipt')}</Label>
          <input id="fin-receipt" name="receipt" type="file" accept={api.RECEIPT_TYPES.join(',')} className="min-h-11 w-full min-w-0 text-base" />
        </div>
      )}
    </>
  )
}
