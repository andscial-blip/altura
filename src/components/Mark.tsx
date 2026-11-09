/** Marchio provvisorio: verrà sostituito dal logo scelto (stessa interfaccia). */
export function Mark({ size = 28, draw = false }: { size?: number; draw?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" fill="none">
      <path className={draw ? "draw" : undefined} d="M5 38 L19 22 L26 29 L35 14 L43 38" stroke="currentColor" strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="35" cy="14" r="3.2" fill="var(--accent)" />
    </svg>
  );
}
