import { listDrugs } from "@/lib/data";
import App from "@/components/App";

export default function Page() {
  const drugs = listDrugs();

  return (
    <div className="phone">
      <div className="statusbar">
        <span>9:41</span>
        <span>●●●●</span>
      </div>
      <div className="screen">
        <App initialDrugs={drugs} />
      </div>
    </div>
  );
}
