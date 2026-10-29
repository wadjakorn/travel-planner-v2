import styles from './map-pin.module.css';

// Another day's stop on the md+ trip map (review §7.2 ghost row): a 10px grey
// dot in a 24×24 hit box. Same a11y split as MapPin: `interactive` (MapLibre)
// is a named <button> whose click bubbles to the Marker; otherwise an
// aria-hidden div, because Google's AdvancedMarker is the focusable button and
// its `title` carries the name.
export function GhostDot({ title, interactive = false }: { title: string; interactive?: boolean }) {
  const dot = <span className={styles.ghostDot} />;
  return interactive ? (
    <button type="button" aria-label={title} title={title} className={styles.ghost}>
      {dot}
    </button>
  ) : (
    <div aria-hidden="true" className={styles.ghost}>
      {dot}
    </div>
  );
}
