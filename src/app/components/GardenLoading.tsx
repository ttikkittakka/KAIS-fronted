import styles from './GardenLoading.module.css';

/** No network assets or timers: short requests finish before the visual appears. */
export default function GardenLoading({ compact = false, message = '나의 정원과 기록을 불러오고 있어요' }: { compact?: boolean; message?: string }) {
  return <section className={`${styles.root} ${compact ? styles.compact : styles.full}`} data-loading-layout={compact ? 'compact' : 'full'} aria-busy="true">
    <div className={styles.content} role="status" aria-live="polite" aria-atomic="true">
      <div className={styles.emblem} aria-hidden="true"><svg viewBox="0 0 64 64" fill="none"><path d="M32 48V27" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><path d="M32 32C17 33 12 24 13 15c12-1 20 5 19 17Z" fill="currentColor" opacity=".65"/><path d="M32 26c0-12 9-18 21-17 1 11-6 19-21 17Z" fill="currentColor"/><path d="M21 49h22l-3 8H24l-3-8Z" fill="currentColor" opacity=".45"/></svg></div>
      <p className={styles.title}>{message}</p>
      <p className={styles.description}>잠시만 기다려 주세요.</p>
      <span className={styles.dots} aria-hidden="true"><i/><i/><i/></span>
    </div>
  </section>;
}
