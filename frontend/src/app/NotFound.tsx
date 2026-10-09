import { Link } from 'react-router'
import { useT } from '@/i18n/index.tsx'

export function NotFound() {
  const { t } = useT()
  return (
    <div className="grid gap-3 py-10 text-center">
      <h1 className="text-xl font-semibold">{t('common.notFound')}</h1>
      <Link to="/" className="text-primary underline">{t('common.back')}</Link>
    </div>
  )
}
