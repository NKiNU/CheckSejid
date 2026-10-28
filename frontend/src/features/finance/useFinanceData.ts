import { useEffect, useRef, useState } from 'react'
import { useT } from '@/i18n/index.tsx'
import * as api from './api.ts'

export function useFinanceData(orgId: string, kind: api.Kind) {
  const { error: errorText } = useT()
  const [records, setRecords] = useState<api.FinanceRecord[] | null>(null)
  const [categories, setCategories] = useState<api.Category[]>([])
  const [collections, setCollections] = useState<api.Collection[]>([])
  const [error, setError] = useState<string | null>(null)
  const kindRef = useRef(kind)
  useEffect(() => {
    kindRef.current = kind
  }, [kind])
  // Drops the result when it is no longer wanted (kind switched or unmounted), so a slow response cannot overwrite a newer list.
  const fetchAll = (k: api.Kind, live: () => boolean) =>
    Promise.all([api.listRecords(orgId, k), api.listCategories(orgId), api.listCollections(orgId)]).then(
      ([r, c, col]) => live() && (setRecords(r), setCategories(c), setCollections(col), setError(null)),
      (e) => live() && setError(errorText(e)),
    )
  const load = () => fetchAll(kind, () => kindRef.current === kind)
  useEffect(() => {
    let live = true
    fetchAll(kind, () => live)
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchAll closes over orgId/errorText; reload only on org or kind change
  }, [orgId, kind])
  return { records, setRecords, categories, collections, error, setError, load }
}
