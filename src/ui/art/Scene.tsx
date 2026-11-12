import { SCENE_RATIO, type SceneName } from './scenes';
import styles from './Scene.module.css';


export type SceneProps = { name: SceneName; /** Width in points; the height follows (10 to 7). */ width?: number; className?: string };

const row = (y: number, long: number) => <path className={styles.dim} d={`M62 ${y}h${long}`} />;

/** What each scene shows: glass and titanium lines, and one ice blue thing, the next step. */
const DRAW: Record<SceneName, () => JSX.Element> = {
  // Today with no plan: a week, one day lit, and the day's card waiting to be filled.
  today: () => (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} className={i === 2 ? styles.accent : styles.pill} x={19 + i * 25} y={12} width={22} height={8} rx={4} />
      ))}
      <rect className={styles.glass} x={24} y={32} width={112} height={66} rx={14} />
      <circle className={styles.accent} cx={46} cy={50} r={4.5} />
      <circle className={styles.ringDim} cx={46} cy={65} r={4.5} />
      <circle className={styles.ringDim} cx={46} cy={80} r={4.5} />
      {row(50, 54)}
      {row(65, 40)}
      {row(80, 48)}
    </>
  ),
  // History with no workouts: a timeline with its first entry lit, the rest still to come.
  history: () => (
    <>
      <path className={styles.dim} d="M34 18V96" strokeDasharray="1 7" />
      {[0, 1, 2].map((i) => (
        <g key={i} opacity={1 - i * 0.3}>
          <rect className={styles.glass} x={50} y={14 + i * 30} width={90} height={24} rx={9} />
          <path className={styles.dim} d={`M62 ${23 + i * 30}h${44 - i * 8}M62 ${30 + i * 30}h${24 - i * 4}`} />
        </g>
      ))}
      <circle className={styles.halo} cx={34} cy={26} r={12} />
      <circle className={styles.accent} cx={34} cy={26} r={5.5} />
      <circle className={styles.ringDim} cx={34} cy={56} r={4.5} />
      <circle className={styles.ringDim} cx={34} cy={86} r={4.5} opacity={0.6} />
    </>
  ),
  // No plans here: a fan of plan cards, the front one marked.
  plans: () => (
    <>
      <rect className={styles.glass} x={46} y={18} width={68} height={80} rx={12} transform="rotate(-14 80 98)" opacity={0.5} />
      <rect className={styles.glass} x={46} y={18} width={68} height={80} rx={12} transform="rotate(-4 80 98)" opacity={0.75} />
      <g transform="rotate(7 80 98)">
        <rect className={styles.solid} x={46} y={18} width={68} height={80} rx={12} />
        <rect className={styles.accent} x={58} y={32} width={26} height={7} rx={3.5} />
        <path className={styles.dim} d="M58 52h44M58 64h32M58 76h38" />
      </g>
    </>
  ),
  // The plan is ready: a clipboard, every line ticked.
  planReady: () => (
    <>
      <rect className={styles.glass} x={32} y={16} width={96} height={84} rx={14} />
      <rect className={styles.clip} x={62} y={9} width={36} height={14} rx={7} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <path className={styles.accentLine} d={`M46 ${45 + i * 18}l4 4l7-8`} />
          <path className={styles.dim} d={`M68 ${45 + i * 18}h${[44, 30, 38][i]}`} />
        </g>
      ))}
    </>
  ),
  // Welcome: a dumbbell at rest in a soft light, on a lit floor.
  welcome: () => (
    <>
      <circle className={styles.halo} cx={80} cy={58} r={44} />
      <path className={styles.bar} d="M46 58H114" />
      <rect className={styles.plate} x={36} y={36} width={13} height={44} rx={5} />
      <rect className={styles.plate} x={111} y={36} width={13} height={44} rx={5} />
      <rect className={styles.plateOuter} x={24} y={44} width={10} height={28} rx={4} />
      <rect className={styles.plateOuter} x={126} y={44} width={10} height={28} rx={4} />
      <path className={styles.accentLine} d="M30 94H130" />
    </>
  ),
};

/**
 * A small vector scene (PLAN 3.6h) for an empty state or a hero: calm, drawn from tokens, one
 * accent. Decoration only: the words next to it say everything, so it is hidden from screen readers.
 */
export function Scene({ name, width = 120, className }: SceneProps) {
  return (
    <svg className={`${styles.scene} ${className ?? ''}`} width={width} height={width * SCENE_RATIO} viewBox="0 0 160 112" aria-hidden="true" focusable="false" data-scene={name} data-testid="art-scene">
      {DRAW[name]()}
    </svg>
  );
}
