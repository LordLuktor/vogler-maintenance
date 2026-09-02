import { NavLink, useNavigate } from "react-router-dom";
import { clearToken, getSession, getToken } from "../api/client";

export default function TopNav() {
  const navigate = useNavigate();
  const isAuthed = !!getToken();
  const isAdmin = getSession()?.is_admin ?? false;

  function handleLogout() {
    clearToken();
    navigate("/login");
  }

  return (
    <header className="topnav">
      <div className="topnav-inner">
        <NavLink to={isAuthed ? "/dashboard" : "/report"} className="brand">
          <span className="brand-mark" aria-hidden="true" />
          Vogler Maintenance
        </NavLink>

        {isAuthed && (
          <nav className="topnav-links">
            <NavLink to="/dashboard" end className={({ isActive }) => (isActive ? "topnav-link active" : "topnav-link")}>
              Tickets
            </NavLink>
            <NavLink to="/pm-schedules" className={({ isActive }) => (isActive ? "topnav-link active" : "topnav-link")}>
              PM Schedule
            </NavLink>
            <NavLink to="/receipts" className={({ isActive }) => (isActive ? "topnav-link active" : "topnav-link")}>
              Receipts
            </NavLink>
            {isAdmin && (
              <NavLink to="/inventory" className={({ isActive }) => (isActive ? "topnav-link active" : "topnav-link")}>
                Inventory
              </NavLink>
            )}
            {isAdmin && (
              <NavLink to="/assets" className={({ isActive }) => (isActive ? "topnav-link active" : "topnav-link")}>
                Assets
              </NavLink>
            )}
            {isAdmin && (
              <NavLink to="/locations" className={({ isActive }) => (isActive ? "topnav-link active" : "topnav-link")}>
                Locations
              </NavLink>
            )}
            {isAdmin && (
              <NavLink to="/users" className={({ isActive }) => (isActive ? "topnav-link active" : "topnav-link")}>
                Users
              </NavLink>
            )}
            <button type="button" className="topnav-link topnav-logout" onClick={handleLogout}>
              Log out
            </button>
          </nav>
        )}
      </div>
    </header>
  );
}
