import { useNavigate, useParams } from "react-router";
import { useSessionStore } from "@/stores/sessionStore";
import { useDirectory } from "@/hooks/useDirectory";
import { Loading } from "@/components/hg/Loading";
import { ResidentPhone, type ResidentTab } from "./ResidentPhone";

const TABS: ResidentTab[] = ["home", "rooms", "alerts", "family", "plan", "privacy"];

/** /resident/*: one column, phone-sized, centered. Tabs live in the URL. */
export default function ResidentApp() {
  const session = useSessionStore((s) => s.session);
  const { data: dir } = useDirectory();
  const params = useParams();
  const navigate = useNavigate();
  const tab = (TABS.find((t) => t === params["*"]) ?? "home") as ResidentTab;
  const home = session?.user.homeId != null ? dir?.homeById.get(session.user.homeId) : undefined;
  if (!home) return <Loading label="Opening your home" className="theme-resident min-h-dvh bg-res-ground text-res-ink" />;
  return (
    <div className="theme-resident min-h-dvh bg-[#DCE6EA]">
      <div className="mx-auto h-dvh max-w-[440px] bg-res-ground shadow-[0_0_40px_rgba(19,35,58,.12)]">
        <ResidentPhone homeCode={home.code} viewerName={session!.user.name} tab={tab} onTab={(t) => navigate(`/resident/${t === "home" ? "" : t}`)} />
      </div>
    </div>
  );
}
