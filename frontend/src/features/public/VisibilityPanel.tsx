import { useState } from 'react'
import { useT } from '../../i18n/index.tsx'
import { Card, CardContent, CardHeader } from '@/components/ui/card.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Select } from '@/components/ui/select.tsx'
import * as api from './api.ts'

const pick = 'flex min-h-11 w-fit max-w-full cursor-pointer items-center rounded-md bg-muted px-4 text-sm font-medium peer-focus-visible:ring-2 peer-focus-visible:ring-ring active:opacity-80'

// Organisation side: visibility (organisation.update) and logo/cover uploads (ADR-020).
export function VisibilityPanel({ orgId, visibility, canEdit, logoUrl, coverUrl }: { orgId: string; visibility: api.Visibility; canEdit: boolean; logoUrl?: string | null; coverUrl?: string | null }) {
  const { t, error: message } = useT()
  const [current, setCurrent] = useState(visibility)
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null)
  const [images, setImages] = useState({ logo: logoUrl ?? null, cover: coverUrl ?? null })
  if (!canEdit)
    return (
      <p className="text-sm text-muted-foreground">
        {t('vis.label')}: {t(`vis.${current}`)}
      </p>
    )

  const change = async (v: api.Visibility) => {
    try {
      setCurrent((await api.setVisibility(orgId, v)).organisation.visibility)
    } catch (e) {
      setStatus({ text: message(e), ok: false })
    }
  }
  const upload = async (which: 'logo' | 'cover', file: File | undefined) => {
    if (!file) return
    if (file.size > api.IMAGE_MAX_BYTES) return setStatus({ text: t('vis.tooBig'), ok: false })
    try {
      const { url } = await api.uploadProfileImage(orgId, which, file)
      setImages((i) => ({ ...i, [which]: url }))
      setStatus({ text: t(which === 'logo' ? 'vis.logoUpdated' : 'vis.coverUpdated'), ok: true })
    } catch (e) {
      setStatus({ text: message(e), ok: false })
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-medium">{t('vis.heading')}</h2>
      </CardHeader>
      <CardContent className="gap-4">
        <div className="grid gap-2">
          <Label htmlFor="vis-select">{t('vis.label')}</Label>
          <Select id="vis-select" value={current} onChange={(e) => change(e.target.value as api.Visibility)}>
            {(['PUBLIC', 'UNLISTED', 'PRIVATE'] as const).map((v) => (
              <option key={v} value={v}>
                {t(`vis.${v}`)}
              </option>
            ))}
          </Select>
        </div>
        {current === 'UNLISTED' && <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{t('vis.shareLink', { url: api.shareLink(location.origin, orgId) })}</p>}
        {(['logo', 'cover'] as const).map((which) => (
          <div key={which} className="grid gap-2">
            {images[which] && <img src={images[which]!} alt="" className={which === 'logo' ? 'size-16 rounded-lg bg-muted object-cover' : 'h-24 w-full rounded-lg bg-muted object-cover'} />}
            <input
              id={`vis-${which}`}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="peer sr-only"
              onChange={(e) => upload(which, e.target.files?.[0])}
            />
            <label htmlFor={`vis-${which}`} className={pick}>
              {t(`vis.${which}`)}
            </label>
          </div>
        ))}
        {status && (status.ok ? <p role="status" className="text-sm">{status.text}</p> : <p role="alert" className="text-sm text-destructive">{status.text}</p>)}
      </CardContent>
    </Card>
  )
}
