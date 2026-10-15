import styles from "./Product.module.css";
export default function NumberFact({ label, value }: { label: string; value: string }) {
  return <div className={styles.number}><dt>{label}</dt><dd>{value}</dd></div>;
}
