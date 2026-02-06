import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { CookieManager } from '@/utils/cookieManager';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertCircle, Loader2, LogOut } from 'lucide-react';

const LoginPage: React.FC = () => {
  const [user_id, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForceLogout, setShowForceLogout] = useState(false);
  const [requiresAdmin, setRequiresAdmin] = useState(false);
  const [activeSessionsCount, setActiveSessionsCount] = useState(0);
  const [pendingCredentials, setPendingCredentials] = useState<{ user_id: string; password: string } | null>(null);
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Auto-redirect if already authenticated
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await login(user_id, password);
      navigate('/dashboard');
    } catch (err: any) {
      const errorCode = err.response?.data?.code;
      const errorMessage = err.response?.data?.message || err.message || 'Login failed. Please try again.';
      const requiresAdminFlag = err.response?.data?.requiresAdmin || false;
      const activeSessions = err.response?.data?.activeSessions || 0;
      
      // Check if it's an "active session exists" error (HTTP 403)
      if (err.response?.status === 403 && errorCode === 'ACTIVE_SESSION_EXISTS') {
        setRequiresAdmin(requiresAdminFlag);
        setActiveSessionsCount(activeSessions);
        
        if (requiresAdminFlag) {
          // Non-admin user: Cannot force logout, need to contact admin
          setError(errorMessage);
          setShowForceLogout(false); // Don't show force logout dialog
          setPendingCredentials(null);
        } else {
          // Admin user: Can force logout
          setPendingCredentials({ user_id, password });
          setShowForceLogout(true);
          setError(errorMessage);
        }
      } else {
        setError(errorMessage);
        setRequiresAdmin(false);
        setShowForceLogout(false);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForceLogout = async () => {
    if (!pendingCredentials) return;

    setIsLoading(true);
    setError('');

    try {
      // Login with force_logout flag
      await login(pendingCredentials.user_id, pendingCredentials.password, true);
      setShowForceLogout(false);
      setPendingCredentials(null);
      navigate('/dashboard');
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.message || 'Force logout failed. Please try again.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };


  // Show loading state while checking authentication
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-gray-600" />
          <p className="mt-4 text-sm text-gray-600">Checking session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            KismatX Admin Panel
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Sign in to your account
          </p>
        </div>

        <Card>
            <CardHeader>
            <CardTitle>Login</CardTitle>
            <CardDescription>
              Enter your credentials to access the admin panel
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className={`flex flex-col space-y-2 p-4 rounded-md ${
                  showForceLogout ? 'bg-yellow-50 border border-yellow-200' : requiresAdmin ? 'bg-orange-50 border border-orange-200' : 'bg-red-50 border border-red-200'
                }`}>
                  <div className="flex items-start space-x-2">
                    <AlertCircle className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
                      showForceLogout ? 'text-yellow-600' : requiresAdmin ? 'text-orange-600' : 'text-red-600'
                    }`} />
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${
                        showForceLogout ? 'text-yellow-800' : requiresAdmin ? 'text-orange-800' : 'text-red-800'
                      }`}>
                        {error}
                      </p>
                      {requiresAdmin && (
                        <div className="mt-3 p-3 bg-white rounded border border-orange-200">
                          <p className="text-sm text-orange-700 font-medium mb-2">
                            Active Session Detected
                          </p>
                          <p className="text-xs text-orange-600 mb-2">
                            You are currently logged in on <strong>{activeSessionsCount} device(s)</strong>. Please logout from the other device(s) first, or contact an administrator to revoke your active sessions.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="user_id">User ID</Label>
                <Input
                  id="user_id"
                  type="text"
                  value={user_id}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="Enter your user ID"
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-3">
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Force Logout Dialog - Only shown for admin users */}
        <Dialog open={showForceLogout && !requiresAdmin} onOpenChange={(open) => {
          if (!open) {
            setShowForceLogout(false);
            setPendingCredentials(null);
            setError('');
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Active Session Detected</DialogTitle>
              <DialogDescription>
                You are currently logged in on {activeSessionsCount} other device(s).
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm text-gray-600 mb-3">
                As an administrator, you can force logout from all other devices and login here. This will end your active session on all other devices.
              </p>
              <p className="text-xs text-gray-500">
                Click "Force Logout & Login" to revoke all existing sessions and login with this device.
              </p>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowForceLogout(false);
                  setPendingCredentials(null);
                  setError('');
                }}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleForceLogout}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Logging in...
                  </>
                ) : (
                  <>
                    <LogOut className="mr-2 h-4 w-4" />
                    Force Logout & Login
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
};

export default LoginPage;
