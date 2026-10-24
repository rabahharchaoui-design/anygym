import { InfoButton } from '../../components/info/InfoButton';
import { GLOSSARY } from '../../data/glossary';
import styles from './InfoDevScreen.module.css';

/** Dev audit page (#/dev/info): every glossary entry with its illustration on one page. Behind the dev flag. */
export function InfoDevScreen() {
  const drawn = GLOSSARY.filter((e) => e.illustration).length;
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Glossary</h1>
        <span className={styles.count}>
          {GLOSSARY.length} terms · {drawn} drawn
        </span>
      </header>
      <ul className={styles.grid}>
        {GLOSSARY.map((e) => {
          const Art = e.illustration;
          return (
            <li key={e.id} className={styles.card} data-testid={`entry-${e.id}`}>
              <div className={styles.art}>{Art ? <Art /> : <span className={styles.none}>No drawing</span>}</div>
              <div className={styles.head}>
                <h2 className={styles.term}>{e.term}</h2>
                <InfoButton id={e.id} />
              </div>
              <p className={styles.id}>
                {e.id} · {e.reviewed ? 'reviewed' : 'not reviewed'}
              </p>
              {e.sentences.map((s) => (
                <p key={s} className={styles.sentence}>
                  {s}
                </p>
              ))}
              {e.weightLine && <p className={styles.weight}>{e.weightLine}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
