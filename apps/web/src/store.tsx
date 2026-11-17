import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { changePostStatus, pinPost, type PostError } from './domain/bulletin';
import type { Lang } from './domain/calendar';
import { ERROR_MESSAGE, submitForApproval, transition, type FinKind, type FinancialRecord, type FinStatus } from './domain/finance';
import { parseAmountToSen } from './domain/money';
import { can } from './domain/rbac';
import type { Post, PostKind, PostStatus, Role } from './domain/types';
import { CURRENT_USER, DEFAULT_FOLLOWING, FINANCIAL_RECORDS, ORGANISATIONS, POSTS, WORKSPACE_ORG_ID } from './data/seed';
import { DICTIONARY, type Key } from './i18n';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: keep in memory only */
  }
}

const POST_ERROR: Record<PostError, string> = {
  FORBIDDEN: 'Your role does not allow this action.',
  INVALID_TRANSITION: 'This post can no longer change to that status.',
  PIN_NOT_PUBLISHED: 'Only published posts can be pinned.',
};

export type Outcome = { ok: true } | { ok: false; message: string };

function useAppState() {
  const [lang, setLangState] = useState<Lang>(() => load('ms.lang', 'en'));
  const [followed, setFollowed] = useState<Set<string>>(() => new Set(load('ms.following', DEFAULT_FOLLOWING)));
  const [posts, setPosts] = useState<Post[]>(POSTS);
  const [records, setRecords] = useState<FinancialRecord[]>(FINANCIAL_RECORDS);
  const [role, setRole] = useState<Role>('admin');

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    save('ms.lang', l);
    document.documentElement.lang = l === 'ms' ? 'ms' : 'en';
  }, []);

  const toggleFollow = useCallback((orgId: string) => {
    setFollowed((prev) => {
      const next = new Set(prev);
      if (next.has(orgId)) next.delete(orgId);
      else next.add(orgId);
      save('ms.following', [...next]);
      return next;
    });
  }, []);

  const t = useCallback((key: Key) => DICTIONARY[lang][key], [lang]);
  const actor = useMemo(() => ({ ...CURRENT_USER, role }), [role]);

  const createPost = useCallback(
    (input: { kind: PostKind; title: string; body: string; startsAt?: string; publish: boolean }): Outcome => {
      const draft: Post = {
        id: `p-${crypto.randomUUID()}`, orgId: WORKSPACE_ORG_ID, kind: input.kind, status: 'DRAFT', pinned: false,
        title: input.title.trim(), body: input.body.trim(), startsAt: input.startsAt,
        createdBy: CURRENT_USER.id, createdAt: new Date().toISOString(),
      };
      if (!input.publish) {
        setPosts((ps) => [draft, ...ps]);
        return { ok: true };
      }
      const r = changePostStatus(draft, 'PUBLISHED', role);
      if (!r.ok) return { ok: false, message: POST_ERROR[r.error] };
      setPosts((ps) => [r.post, ...ps]);
      return { ok: true };
    },
    [role],
  );

  const setPostStatus = useCallback(
    (id: string, to: PostStatus): Outcome => {
      const post = posts.find((p) => p.id === id && p.orgId === WORKSPACE_ORG_ID);
      if (!post) return { ok: false, message: 'Post not found.' };
      const r = changePostStatus(post, to, role);
      if (!r.ok) return { ok: false, message: POST_ERROR[r.error] };
      setPosts((ps) => ps.map((p) => (p.id === id ? r.post : p)));
      return { ok: true };
    },
    [posts, role],
  );

  const togglePin = useCallback(
    (id: string): Outcome => {
      const r = pinPost(posts, id, role);
      if (!r.ok) return { ok: false, message: POST_ERROR[r.error] };
      setPosts(r.posts);
      return { ok: true };
    },
    [posts, role],
  );

  const moveRecord = useCallback(
    (id: string, to: FinStatus | 'SUBMIT', reason?: string): Outcome => {
      const record = records.find((r) => r.id === id);
      if (!record) return { ok: false, message: 'Record not found.' };
      const opts = { orgId: WORKSPACE_ORG_ID, reason };
      const r = to === 'SUBMIT' ? submitForApproval(record, actor, opts) : transition(record, to, actor, opts);
      if (!r.ok) return { ok: false, message: ERROR_MESSAGE[r.error] };
      setRecords((rs) => rs.map((x) => (x.id === id ? r.record : x)));
      return { ok: true };
    },
    [records, actor],
  );

  const createRecord = useCallback(
    (input: { kind: FinKind; description: string; category: string; amount: string; date: string; submit: boolean }): Outcome => {
      if (!can(role, input.kind === 'expense' ? 'finance.expense.create' : 'finance.income.create')) return { ok: false, message: ERROR_MESSAGE.FORBIDDEN };
      const amount = parseAmountToSen(input.amount);
      if (amount === null) return { ok: false, message: 'Enter an amount above zero with at most two decimals, for example 1850.00.' };
      if (input.description.trim().length < 3) return { ok: false, message: 'Add a short description (at least 3 characters).' };
      if (!input.category.trim()) return { ok: false, message: 'Choose a category.' };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, message: 'Choose a date.' };
      const prefix = { expense: 'EXP', income: 'INC', collection: 'COL' }[input.kind];
      const max = Math.max(0, ...records.filter((r) => r.id.startsWith(prefix)).map((r) => Number(r.id.split('-')[1])));
      const draft: FinancialRecord = {
        id: `${prefix}-${String(max + 1).padStart(4, '0')}`, orgId: WORKSPACE_ORG_ID, kind: input.kind, amount, currency: 'MYR',
        date: input.date, category: input.category.trim(), description: input.description.trim(), status: 'DRAFT',
        createdBy: actor.id, createdByName: actor.name,
        audit: [{ action: 'Created as draft', actorId: actor.id, actorName: actor.name, at: new Date().toISOString(), to: 'DRAFT' }],
      };
      let record = draft;
      if (input.submit) {
        const r = submitForApproval(draft, actor, { orgId: WORKSPACE_ORG_ID });
        if (!r.ok) return { ok: false, message: ERROR_MESSAGE[r.error] };
        record = r.record;
      }
      setRecords((rs) => [record, ...rs]);
      return { ok: true };
    },
    [records, actor, role],
  );

  return {
    createRecord,
    lang, setLang, t, followed, toggleFollow, orgs: ORGANISATIONS, posts, records, role, setRole, actor,
    createPost, setPostStatus, togglePin, moveRecord,
  };
}

type AppState = ReturnType<typeof useAppState>;
const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const value = useAppState();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}
