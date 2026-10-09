// Only same-origin absolute paths are allowed as a post-login target (open-redirect guard).
export function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !/[\x00-\x1f\\]/.test(next) ? next : '/feed'
}
