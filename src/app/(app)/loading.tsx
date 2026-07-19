import { LogoMark } from "@/components/brand";

export default function AppLoading() {
  return <div className="route-state" aria-live="polite"><span><LogoMark size={58} /></span><p className="eyebrow">Loading your signal</p><h1>Pulling things into focus.</h1><div className="route-skeleton"><i /><i /><i /></div></div>;
}