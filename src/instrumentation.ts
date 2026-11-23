export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NODE_ENV !== 'development' ||
      process.env.ONESTEP_NEXT_DB_DIAGNOSTIC !== 'read-only-once') return;
  const { runNextDbDiagnostic } = await import('./lib/account/next-db-diagnostic');
  await runNextDbDiagnostic();
}
