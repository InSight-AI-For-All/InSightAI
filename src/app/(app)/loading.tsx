import { ScanSearch } from "lucide-react";

export default function AppLoading() {
  return <div className="route-state" aria-live="polite"><span><ScanSearch size={28} /></span><p className="eyebrow">Loading your signal</p><h1>Pulling things into focus.</h1><div className="route-skeleton"><i /><i /><i /></div></div>;
}