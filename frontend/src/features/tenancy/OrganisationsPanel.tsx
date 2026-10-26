import { useEffect, useState, type FormEvent } from 'react'
import { useT } from '../../i18n/index.tsx'
import { ConfirmDialog } from '@/components/ConfirmDialog.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent, CardHeader } from '@/components/ui/card.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Select } from '@/components/ui/select.tsx'
import { Textarea } from '@/components/ui/textarea.tsx'
import { myPermissions } from '../rbac/api.ts'
import * as api from './api.ts'
import { orgStatusVariant } from './orgStatus.ts'

// Phase 04: profile form + "Complete onboarding" while DRAFT/ONBOARDING, "Archive" for the owner.
// Controls are hidden by permission and status; the server enforces both (AUTH-003, ORG-009).
export function LifecyclePanel({ org, onChange }: { org: api.Organisation; onChange: (o: api.Organisation) => void }) {
  const { t, error: errorText } = useT()
  const [perms, setPerms] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [confirmArchive, setConfirmArchive] = useState(false)
  useEffect(() => {
    myPermissions(org.id).then((p) => setPerms(new Set(p.permissions)), () => setPerms(new Set()))
  }, [org.id])

  const run = async (fn: () => Promise<api.Organisation>) => {
    setError(null)
    try {
      onChange(await fn())
    } catch (e) {
      setError(errorText(e))
    }
  }
  const onboarding = org.status === 'DRAFT' || org.status === 'ONBOARDING'

  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    // Empty input clears an optional field (null); type/state/country cannot be cleared, so they are
    // omitted when empty. The server validates everything.
    const v = (k: string) => String(f.get(k) ?? '').trim() || null
    const req = (k: string) => v(k) ?? undefined
    return run(() =>
      api.updateProfile(org.id, {
        type: req('type') as NonNullable<api.Profile['type']> | undefined,
        description: v('description'),
        contactEmail: v('contactEmail'),
        contactPhone: v('contactPhone'),
        addressLine: v('addressLine'),
        state: req('state'),
        country: req('country')?.toUpperCase(),
      }),
    )
  }

  const field = 'grid gap-2'
  return (
    <div className="grid gap-4">
      {onboarding && perms.has('organisation.update') && (
        <Card>
          <CardHeader>
            <h2 className="text-base font-medium">{t('org.profile')}</h2>
          </CardHeader>
          <CardContent>
            <form onSubmit={save} className="grid gap-4">
              <div className={field}>
                <Label htmlFor="org-type">{t('org.type')}</Label>
                <Select id="org-type" name="type" defaultValue={org.type ?? ''}>
                  <option value="">{t('common.choose')}</option>
                  {api.ORG_TYPES.map((ty) => (
                    <option key={ty} value={ty}>
                      {t(`orgType.${ty}`)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className={field}>
                <Label htmlFor="org-description">{t('common.description')}</Label>
                <Textarea id="org-description" name="description" maxLength={2000} defaultValue={org.description ?? ''} />
              </div>
              <div className={field}>
                <Label htmlFor="org-contactEmail">{t('org.contactEmail')}</Label>
                <Input id="org-contactEmail" className="h-11" name="contactEmail" type="email" maxLength={254} defaultValue={org.contactEmail ?? ''} />
              </div>
              <div className={field}>
                <Label htmlFor="org-contactPhone">{t('org.contactPhone')}</Label>
                <Input id="org-contactPhone" className="h-11" name="contactPhone" maxLength={30} defaultValue={org.contactPhone ?? ''} />
              </div>
              <div className={field}>
                <Label htmlFor="org-addressLine">{t('org.address')}</Label>
                <Input id="org-addressLine" className="h-11" name="addressLine" maxLength={300} defaultValue={org.addressLine ?? ''} />
              </div>
              <div className={field}>
                <Label htmlFor="org-state">{t('org.state')}</Label>
                <Input id="org-state" className="h-11" name="state" maxLength={100} defaultValue={org.state ?? ''} />
              </div>
              <div className={field}>
                <Label htmlFor="org-country">{t('org.country')}</Label>
                <Input id="org-country" className="h-11" name="country" maxLength={2} pattern="[A-Za-z]{2}" defaultValue={org.country ?? ''} />
              </div>
              <Button type="submit" className="h-11">{t('org.saveProfile')}</Button>
              {org.status === 'ONBOARDING' && (
                <Button type="button" variant="outline" className="h-11" onClick={() => run(() => api.completeOnboarding(org.id))}>
                  {t('org.completeOnboarding')}
                </Button>
              )}
            </form>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <h2 className="text-base font-medium">{t('org.status')}</h2>
        </CardHeader>
        <CardContent>
          <Badge variant={orgStatusVariant(org.status)}>{t(`state.${org.status}`)}</Badge>
          {perms.has('organisation.archive') && (org.status === 'ACTIVE' || org.status === 'SUSPENDED') && (
            <Button type="button" variant="destructive" className="h-11" onClick={() => setConfirmArchive(true)}>
              {t('org.archive')}
            </Button>
          )}
        </CardContent>
      </Card>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title={t('org.archive')}
        body={t('org.archiveConfirm', { name: org.name })}
        confirmLabel={t('org.archive')}
        destructive
        onConfirm={() => run(() => api.archiveOrganisation(org.id))}
      />
    </div>
  )
}
