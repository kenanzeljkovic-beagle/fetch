export function Banner({ kind, children }: { kind: 'info' | 'warn' | 'error' | 'success'; children: React.ReactNode }) {
  const styles = {
    info: 'bg-blue-50 text-blue-900 border-blue-200',
    warn: 'bg-amber-50 text-amber-900 border-amber-200',
    error: 'bg-red-50 text-red-900 border-red-200',
    success: 'bg-green-50 text-green-900 border-green-200',
  }[kind];
  return <div className={`border rounded-md px-3 py-2 text-sm ${styles}`}>{children}</div>;
}
