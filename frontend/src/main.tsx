import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import '@xyflow/react/dist/style.css'
import './index.css'
import { I18nProvider } from './i18n'
import { AuthProvider, useAuth } from './auth'
import { Spinner, ToastProvider } from './components/ui'
import AppLayout from './components/AppLayout'
import Landing from './pages/Landing'
import AuthPage from './pages/Auth'
import Home from './pages/Home'
import Flows from './pages/Flows'
import Contacts from './pages/Contacts'
import Activity from './pages/Activity'
import Accounts from './pages/Accounts'
import Settings from './pages/Settings'
import FlowEditor from './editor/FlowEditor'
import Billing from './pages/Billing'
import Inbox from './pages/Inbox'
import Broadcasts from './pages/Broadcasts'
import Integrations from './pages/Integrations'
import { Forgot, Reset } from './pages/Recover'
import AdminOverviewPage from './pages/admin/AdminOverview'
import AdminUsers from './pages/admin/AdminUsers'
import AdminSettings from './pages/admin/AdminSettings'

function Protected({ children }: { children: JSX.Element }) {
  const { me, loading } = useAuth()
  if (loading) return <Spinner className="min-h-screen" />
  if (!me) return <Navigate to="/login" replace />
  return children
}

function AdminOnly({ children }: { children: JSX.Element }) {
  const { me } = useAuth()
  if (!me?.user.is_admin) return <Navigate to="/app" replace />
  return children
}

function GuestOnly({ children }: { children: JSX.Element }) {
  const { me, loading } = useAuth()
  if (loading) return <Spinner className="min-h-screen" />
  if (me) return <Navigate to="/app" replace />
  return children
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<GuestOnly><AuthPage mode="login" /></GuestOnly>} />
              <Route path="/register" element={<GuestOnly><AuthPage mode="register" /></GuestOnly>} />
              <Route path="/forgot" element={<GuestOnly><Forgot /></GuestOnly>} />
              <Route path="/reset" element={<Reset />} />
              <Route path="/app/flows/:id" element={<Protected><FlowEditor /></Protected>} />
              <Route path="/app" element={<Protected><AppLayout /></Protected>}>
                <Route index element={<Home />} />
                <Route path="flows" element={<Flows />} />
                <Route path="contacts" element={<Contacts />} />
                <Route path="activity" element={<Activity />} />
                <Route path="accounts" element={<Accounts />} />
                <Route path="settings" element={<Settings />} />
                <Route path="billing" element={<Billing />} />
                <Route path="inbox" element={<Inbox />} />
                <Route path="broadcasts" element={<Broadcasts />} />
                <Route path="integrations" element={<Integrations />} />
                <Route path="admin" element={<AdminOnly><AdminOverviewPage /></AdminOnly>} />
                <Route path="admin/users" element={<AdminOnly><AdminUsers /></AdminOnly>} />
                <Route path="admin/settings" element={<AdminOnly><AdminSettings /></AdminOnly>} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </I18nProvider>
  </StrictMode>,
)
