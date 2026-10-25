import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Outlet, createBrowserRouter, useLocation } from "react-router";
import type { Role } from "@/api/contracts";
import { LANDING, useSessionStore } from "@/stores/sessionStore";
import { Root } from "./Root";
import { OpsLayout } from "./layouts/OpsLayout";
import { LoginPage } from "@/features/login/LoginPage";
import { PlanetPage } from "@/features/map/globe/PlanetPage";
import { Loading } from "@/components/hg/Loading";

const SettlementPage = lazy(() => import("@/features/map/settlement/SettlementPage"));
const TwinPage = lazy(() => import("@/features/twin/TwinPage"));
const IncidentListPage = lazy(() => import("@/features/incidents/IncidentListPage"));
const IncidentDetailPage = lazy(() => import("@/features/incidents/IncidentDetailPage"));
const ResidentApp = lazy(() => import("@/features/resident/ResidentApp"));
const DemoPage = lazy(() => import("@/features/demo/DemoPage"));
const LandingPage = lazy(() => import("@/features/landing/LandingPage"));
const FleetPage = lazy(() => import("@/features/fleet/FleetPage"));
const TechPage = lazy(() => import("@/features/tech/TechPage"));
const AdminPage = lazy(() => import("@/features/admin/AdminPage"));

const S = ({ children }: { children: ReactNode }) => <Suspense fallback={<Loading />}>{children}</Suspense>;

/** No session → /login. Wrong role → that role's own landing route. */
function RequireRole({ roles }: { roles: Role[] }) {
  const session = useSessionStore((s) => s.session);
  const loc = useLocation();
  if (!session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!roles.includes(session.user.role)) return <Navigate to={LANDING[session.user.role]} replace />;
  return <Outlet />;
}

const OPS: Role[] = ["OPERATOR", "SUPERVISOR", "RESPONDER"];

export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: "/", element: <S><LandingPage /></S> },
      { path: "/login", element: <LoginPage /> },
      { path: "/demo", element: <S><DemoPage /></S> },
      {
        path: "/ops",
        element: <RequireRole roles={OPS} />,
        children: [
          {
            element: <OpsLayout />,
            children: [
              { index: true, element: <Navigate to="/ops/map" replace /> },
              { path: "map", element: <PlanetPage /> },
              { path: "map/:settlementCode/:domeCode?", element: <S><SettlementPage /></S> },
              { path: "homes/:homeCode", element: <S><TwinPage /></S> },
              { path: "incidents", element: <S><IncidentListPage /></S> },
              { path: "incidents/:incidentCode", element: <S><IncidentDetailPage /></S> },
              { path: "fleet", element: <S><FleetPage /></S> },
            ],
          },
        ],
      },
      {
        path: "/resident/*",
        element: <RequireRole roles={["HOMEOWNER", "HOUSEHOLD_MEMBER"]} />,
        children: [{ path: "*", element: <S><ResidentApp /></S> }],
      },
      { path: "/tech", element: <RequireRole roles={["TECHNICIAN", "SUPERVISOR"]} />, children: [{ index: true, element: <S><TechPage /></S> }] },
      { path: "/admin", element: <RequireRole roles={["ADMIN", "SUPERVISOR"]} />, children: [{ index: true, element: <S><AdminPage /></S> }] },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
