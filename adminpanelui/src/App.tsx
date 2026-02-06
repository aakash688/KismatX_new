import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import Layout from '@/components/Layout';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import UsersPage from '@/pages/UsersPage';
import UserProfilePage from '@/pages/UserProfilePage';
import WalletManagementPage from '@/pages/WalletManagementPage';
import SettingsPage from '@/pages/SettingsPage';
import AuditLogsPage from '@/pages/AuditLogsPage';
import LoginHistoryPage from '@/pages/LoginHistoryPage';
import DepositsPage from '@/pages/DepositsPage';
import GamesPage from '@/pages/GamesPage';
import GameDetailPage from '@/pages/GameDetailPage';
import ManualSettlementPage from '@/pages/ManualSettlementPage';
import LiveSettlementPage from '@/pages/LiveSettlementPage';
import StatsPage from '@/pages/StatsPage';

// Protected Route Component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  // Show loading spinner while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  // If not authenticated after loading, redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // User is authenticated, render the protected content
  return <>{children}</>;
};

// Public Route Component (redirects to dashboard if already authenticated)
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <>{children}</>;
};

const App: React.FC = () => {
  return (
    <TooltipProvider>
      <AuthProvider>
        <Router>
        <div className="App">
          <Routes>
            {/* Public Routes */}
            <Route 
              path="/login" 
              element={
                <PublicRoute>
                  <LoginPage />
                </PublicRoute>
              } 
            />

            {/* Protected Routes */}
            <Route 
              path="/" 
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="users/:id/profile" element={<UserProfilePage />} />
              <Route path="wallet" element={<WalletManagementPage />} />
              <Route path="deposits" element={<DepositsPage />} />
              <Route path="logins" element={<LoginHistoryPage />} />
              <Route path="audit-logs" element={<AuditLogsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="games" element={<GamesPage />} />
              <Route path="games/:gameId" element={<GameDetailPage />} />
              <Route path="games/:gameId/settle" element={<ManualSettlementPage />} />
              <Route path="live-settlement" element={<LiveSettlementPage />} />
              <Route path="stats" element={<StatsPage />} />
              {/* Add more routes here as we create them */}
              <Route path="roles" element={<div className="p-6"><h1 className="text-2xl font-bold">Roles Management</h1><p className="text-gray-600">Coming soon...</p></div>} />
              <Route path="permissions" element={<div className="p-6"><h1 className="text-2xl font-bold">Permissions Management</h1><p className="text-gray-600">Coming soon...</p></div>} />
            </Route>

            {/* Catch all route */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </div>
        </Router>
      </AuthProvider>
    </TooltipProvider>
  );
};

export default App;