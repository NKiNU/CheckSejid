import { useState } from 'react'
import { useT } from '../../i18n/index.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Button } from '@/components/ui/button.tsx'
import * as api from './api.ts'

const mainFirst = (images: api.HubImage[]) => [...images].sort((a, b) => Number(b.isMain) - Number(a.isMain))
const frame = 'aspect-video w-full rounded-lg bg-muted object-cover'

// The main photo as a 16:9 card header (lists, homepage). Nothing when the item has no images.
export function MainPhoto({ images, title }: { images: api.HubImage[]; title: string }) {
  const main = mainFirst(images)[0]
  return main ? <img src={main.url} alt={title} loading="lazy" className={frame} /> : null
}

// All images, swipeable with plain CSS scroll-snap; focusable so keyboard users can scroll it.
export function Gallery({ images, title }: { images: api.HubImage[]; title: string }) {
  const { t } = useT()
  if (images.length === 0) return null
  if (images.length === 1) return <MainPhoto images={images} title={title} />
  const sorted = mainFirst(images)
  return (
    <div role="group" aria-label={t('hub.img.gallery', { n: sorted.length })} tabIndex={0} className="flex snap-x snap-mandatory gap-2 overflow-x-auto rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {sorted.map((im, i) => (
        <img key={im.id} src={im.url} alt={`${title} (${i + 1}/${sorted.length})`} loading="lazy" className={`${frame} shrink-0 snap-center`} />
      ))}
    </div>
  )
}

const pick = 'flex min-h-11 w-fit max-w-full cursor-pointer items-center rounded-md bg-muted px-4 text-sm font-medium peer-focus-visible:ring-2 peer-focus-visible:ring-ring active:opacity-80'

// Draft items only (ADR-033 §4): add, remove and choose the main photo. `run` reloads the lists.
export function ImageManager({ orgId, kind, item, run }: {
  orgId: string
  kind: api.Kind
  item: api.Post | api.HubEvent
  run: (fn: () => Promise<unknown>) => Promise<boolean>
}) {
  const { t } = useT()
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    await run(fn)
    setBusy(false)
  }
  const add = (file: File | undefined) => {
    if (!file) return
    const bad = api.checkHubImage(file, item.images.length)
    setProblem(bad && t(bad))
    if (!bad) act(() => api.uploadHubImage(orgId, kind, item.id, file))
  }
  const id = `img-${item.id}`
  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium">{t('hub.img.heading', { n: item.images.length, max: api.HUB_IMAGE_MAX_COUNT })}</p>
      {item.images.length > 0 && (
        <ul className="grid grid-cols-2 gap-2">
          {item.images.map((im, i) => (
            <li key={im.id} className="grid min-w-0 content-start gap-1">
              <img src={im.url} alt={`${item.title} (${i + 1}/${item.images.length})`} loading="lazy" className={frame} />
              {im.isMain ? (
                <Badge className="w-fit">{t('hub.img.main')}</Badge>
              ) : (
                <Button type="button" variant="outline" className="h-11 px-3" disabled={busy} onClick={() => act(() => api.setMainHubImage(orgId, kind, item.id, im.id))}>
                  {t('hub.img.setMain')}
                </Button>
              )}
              <Button type="button" variant="outline" className="h-11 px-3" disabled={busy} onClick={() => act(() => api.removeHubImage(orgId, kind, item.id, im.id))}>
                {t('hub.img.remove')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {item.images.length < api.HUB_IMAGE_MAX_COUNT && (
        <>
          <input
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="peer sr-only"
            disabled={busy}
            onChange={(e) => {
              const file = e.currentTarget.files?.[0]
              e.currentTarget.value = '' // re-picking the same file must fire onChange
              add(file)
            }}
          />
          <label htmlFor={id} className={pick}>
            {t('hub.img.add')}
          </label>
        </>
      )}
      <p className="text-xs text-muted-foreground">{t('hub.img.hint')}</p>
      {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
    </div>
  )
}
