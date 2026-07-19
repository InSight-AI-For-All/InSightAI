import styles from "./admin.module.css";

export default function AdminLoading() {
  return <div className={styles.loading} aria-live="polite"><span /><span /><span /><div /><div /></div>;
}