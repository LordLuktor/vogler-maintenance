import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { getToken, getSession } from "./api/client";
import ReportPage from "./pages/ReportPage";
import LoginPage from "./pages/LoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import DashboardPage from "./pages/DashboardPage";
import TicketDetailPage from "./pages/TicketDetailPage";
import PmSchedulesPage from "./pages/PmSchedulesPage";
import UsersPage from "./pages/UsersPage";
import InventoryPage from "./pages/InventoryPage";
import AssetsPage from "./pages/AssetsPage";
import ReceiptsPage from "./pages/ReceiptsPage";

function RequireAuth({ children }: { children: JSX.Element }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}

function RequireAdmin({ children }: { children: JSX.Element }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return getSession()?.is_admin ? children : <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/report" replace />} />
        <Route path="/report" element={<ReportPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <DashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/tickets/:id"
          element={
            <RequireAuth>
              <TicketDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/pm-schedules"
          element={
            <RequireAuth>
              <PmSchedulesPage />
            </RequireAuth>
          }
        />
        <Route
          path="/users"
          element={
            <RequireAdmin>
              <UsersPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/inventory"
          element={
            <RequireAdmin>
              <InventoryPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/assets"
          element={
            <RequireAdmin>
              <AssetsPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/receipts"
          element={
            <RequireAuth>
              <ReceiptsPage />
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
