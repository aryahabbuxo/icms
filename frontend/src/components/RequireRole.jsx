import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { HOME } from "../lib/format";

export default function RequireRole({ role }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to={HOME[user.role]} replace />;
  return <Outlet />;
}
