import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider, useAuth } from "./context/AuthContext";
import AppShell from "./components/AppShell";
import RequireRole from "./components/RequireRole";
import Login from "./pages/Login";
import CustomerHome from "./pages/customer/CustomerHome";
import * as P from "./pages/Placeholders";
import { HOME } from "./lib/format";

function Root() {
  const { user } = useAuth();
  return <Navigate to={user ? HOME[user.role] : "/login"} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireRole />}>
            <Route element={<AppShell />}>
              <Route element={<RequireRole role="customer" />}>
                <Route path="/c" element={<CustomerHome />} />
                <Route path="/c/policies/:id" element={<P.PolicyDetail />} />
                <Route path="/c/claims/new" element={<P.NewClaim />} />
                <Route path="/c/claims/:id" element={<P.ClaimDetail />} />
              </Route>
              <Route element={<RequireRole role="adjuster" />}>
                <Route path="/adj" element={<P.AdjusterQueue />} />
                <Route path="/adj/claims/:id" element={<P.AdjusterClaim />} />
              </Route>
              <Route element={<RequireRole role="admin" />}>
                <Route path="/admin" element={<P.AdminHome />} />
                <Route path="/admin/claims" element={<P.AdminClaims />} />
                <Route path="/admin/ask" element={<P.AdminAsk />} />
                <Route path="/admin/audit" element={<P.AdminAudit />} />
                <Route path="/admin/models" element={<P.AdminModels />} />
              </Route>
              <Route element={<RequireRole role="agent" />}>
                <Route path="/agent" element={<P.AgentHome />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Root />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="bottom-right" toastOptions={{ style: { fontSize: 14, borderRadius: 999, background: "#1d2924", color: "#f2eee3", padding: "10px 18px" } }} />
    </AuthProvider>
  );
}
