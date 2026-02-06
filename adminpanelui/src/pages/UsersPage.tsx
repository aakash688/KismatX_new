import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { adminService, User } from '@/services/services';
import UserForm from '@/components/UserForm';
import ResetPasswordDialog from '@/components/ResetPasswordDialog';
import { 
  Plus, 
  Search, 
  Edit, 
  Mail, 
  Phone,
  UserX,
  UserCheck,
  Key,
  Lock,
  Activity
} from 'lucide-react';

const UsersPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Initialize statusFilter from URL parameter
  const urlStatus = searchParams.get('status');
  const [statusFilter, setStatusFilter] = useState(urlStatus || 'all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showUserForm, setShowUserForm] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<{ id: string; name: string } | null>(null);
  const [activeSessions, setActiveSessions] = useState<Record<string, number>>({});

  const limit = 10;

  useEffect(() => {
    // Update statusFilter when URL changes
    const urlStatus = searchParams.get('status');
    if (urlStatus) {
      setStatusFilter(urlStatus);
    } else {
      setStatusFilter('all');
    }
    // Reset to page 1 when filter changes
    setCurrentPage(1);
  }, [searchParams]);

  useEffect(() => {
    fetchUsers();
  }, [currentPage, statusFilter, searchTerm]);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      
      // Ensure currentPage is a valid number
      const page = isNaN(currentPage) || currentPage < 1 ? 1 : currentPage;
      
      const params: any = {
        page: page,
        limit,
      };
      
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }
      
      if (searchTerm) {
        params.search = searchTerm;
      }

      const response = await adminService.getUsers(params);
      setUsers(response.users);
      setTotalUsers(response.total);

      // Fetch active sessions for all users
      const sessions: Record<string, number> = {};
      for (const user of response.users) {
        try {
          const sessionData = await adminService.getUserActiveSessions(user.user_id);
          sessions[user.user_id] = sessionData.activeSessions;
        } catch (err) {
          sessions[user.user_id] = 0;
        }
      }
      setActiveSessions(sessions);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = async (userId: string, newStatus: string) => {
    try {
      await adminService.updateUserStatus(userId, newStatus);
      fetchUsers(); // Refresh the list
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update user status');
    }
  };

  const handleKillSessions = async (user_id: string) => {
    try {
      const result = await adminService.killUserSessions(user_id);
      alert(`Successfully killed ${result.revokedCount} active sessions for user ${user_id}`);
      fetchUsers(); // Refresh the list
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to kill user sessions');
    }
  };

  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    setShowUserForm(true);
  };

  const handleAddUser = () => {
    setSelectedUser(null);
    setShowUserForm(true);
  };

  const handleResetPassword = (user: User) => {
    setResetPasswordUser({
      id: user.id.toString(),
      name: `${user.first_name} ${user.last_name} (${user.user_id})`
    });
    setShowResetPassword(true);
  };

  const handleFormSuccess = () => {
    fetchUsers(); // Refresh the list
  };

  const handleVerifyEmail = async (userId: string) => {
    try {
      await adminService.verifyUserEmail(userId);
      fetchUsers(); // Refresh the list
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to verify email');
    }
  };

  const handleVerifyMobile = async (userId: string) => {
    try {
      await adminService.verifyUserMobile(userId);
      fetchUsers(); // Refresh the list
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to verify mobile');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="success">Active</Badge>;
      case 'inactive':
        return <Badge variant="secondary">Inactive</Badge>;
      case 'banned':
        return <Badge variant="destructive">Banned</Badge>;
      case 'pending':
        return <Badge variant="outline">Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };


  const filteredUsers = users.filter(user => {
    const matchesSearch = user.user_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  // Safeguards for pagination math
  const safeTotalUsers = Number.isFinite(totalUsers) && totalUsers > 0 ? totalUsers : 0;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 10;
  const safeCurrentPage = Number.isFinite(currentPage) && currentPage > 0 ? currentPage : 1;
  const totalPages = Math.ceil(safeTotalUsers / safeLimit) || 1;
  const startIdx = safeTotalUsers > 0 ? (safeCurrentPage - 1) * safeLimit + 1 : 0;
  const endIdx = safeTotalUsers > 0 ? Math.min(safeCurrentPage * safeLimit, safeTotalUsers) : 0;

  // Pagination based on filtered users (client-side search)
  const paginatedUsers = filteredUsers.slice((safeCurrentPage - 1) * safeLimit, safeCurrentPage * safeLimit);
  const displayCount = paginatedUsers.length;
  const displayStartIdx = displayCount > 0 ? (safeCurrentPage - 1) * safeLimit + 1 : 0;
  const displayEndIdx = displayCount > 0 ? displayStartIdx + displayCount - 1 : 0;
  const displayTotal = filteredUsers.length;
  const displayTotalPages = Math.ceil(displayTotal / safeLimit) || 1;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-600">Manage user accounts and permissions</p>
        </div>
        <Button onClick={handleAddUser}>
          <Plus className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>
            View and manage all user accounts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="banned">Banned</option>
              <option value="pending">Pending</option>
            </select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>Mobile</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Wallet Balance</TableHead>
                    <TableHead>Active Sessions</TableHead>
                    <TableHead>Verified</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.user_id}</TableCell>
                      <TableCell>
                        <button
                          onClick={() => navigate(`/users/${user.id}/profile`)}
                          className="font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                        >
                          {user.first_name} {user.last_name}
                        </button>
                      </TableCell>
                      <TableCell>
                        {user.city && user.state ? (
                          <span className="text-sm">{user.city}, {user.state}</span>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <span>{user.mobile}</span>
                          {user.mobile_verified ? (
                            <Phone className="h-4 w-4 text-green-600" />
                          ) : (
                            <Phone className="h-4 w-4 text-gray-400" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{user.user_type}</Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(user.status)}</TableCell>
                      <TableCell>
                        {user.deposit_amount ? `₹${user.deposit_amount.toLocaleString()}` : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Badge 
                            variant={activeSessions[user.user_id] > 0 ? "success" : "outline"}
                            className="flex items-center space-x-1"
                          >
                            <Activity className="h-3 w-3" />
                            <span>{activeSessions[user.user_id] || 0}</span>
                          </Badge>
                          {activeSessions[user.user_id] > 0 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleKillSessions(user.user_id)}
                                  className="h-6 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  <Key className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Kill Sessions</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-3">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => {
                                  if (user.email_verified && user.is_email_verified_by_admin) {
                                    return; // Already verified, do nothing
                                  }
                                  if (confirm(`Do you want to verify email for ${user.first_name} ${user.last_name}?`)) {
                                    handleVerifyEmail(user.id.toString());
                                  }
                                }}
                                className={`transition-colors hover:opacity-80 ${
                                  user.email_verified && user.is_email_verified_by_admin 
                                    ? 'text-green-600 cursor-default' 
                                    : 'text-gray-400 hover:text-gray-600 cursor-pointer'
                                }`}
                                disabled={user.email_verified && user.is_email_verified_by_admin}
                              >
                                <Mail className="h-5 w-5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>
                                {user.email_verified && user.is_email_verified_by_admin 
                                  ? 'Email Verified' 
                                  : 'Click to verify email'
                                }
                              </p>
                            </TooltipContent>
                          </Tooltip>
                          
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => {
                                  if (user.mobile_verified && user.is_mobile_verified_by_admin) {
                                    return; // Already verified, do nothing
                                  }
                                  if (confirm(`Do you want to verify mobile for ${user.first_name} ${user.last_name}?`)) {
                                    handleVerifyMobile(user.id.toString());
                                  }
                                }}
                                className={`transition-colors hover:opacity-80 ${
                                  user.mobile_verified && user.is_mobile_verified_by_admin 
                                    ? 'text-green-600 cursor-default' 
                                    : 'text-gray-400 hover:text-gray-600 cursor-pointer'
                                }`}
                                disabled={user.mobile_verified && user.is_mobile_verified_by_admin}
                              >
                                <Phone className="h-5 w-5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>
                                {user.mobile_verified && user.is_mobile_verified_by_admin 
                                  ? 'Mobile Verified' 
                                  : 'Click to verify mobile'
                                }
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                      <TableCell>
                        <TooltipProvider>
                          <div className="flex space-x-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleEditUser(user)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Edit User</p>
                              </TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleResetPassword(user)}
                                  className="text-blue-600 hover:text-blue-700"
                                >
                                  <Lock className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Reset Password</p>
                              </TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    const newStatus = user.status === 'active' ? 'banned' : 'active';
                                    handleStatusChange(user.id.toString(), newStatus);
                                  }}
                                  className={user.status === 'active' ? 'text-red-600 hover:text-red-700' : 'text-green-600 hover:text-green-700'}
                                >
                                  {user.status === 'active' ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{user.status === 'active' ? 'Ban User' : 'Activate User'}</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </TooltipProvider>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          <div className="flex items-center justify-between mt-6">
            <div className="text-sm text-gray-700">
              Page {safeCurrentPage} of {displayTotalPages}
            </div>
            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={safeCurrentPage === 1 || displayTotal === 0}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, displayTotalPages))}
                disabled={safeCurrentPage === displayTotalPages || displayTotal === 0}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* User Form Dialog */}
      <UserForm
        isOpen={showUserForm}
        onClose={() => {
          setShowUserForm(false);
          setSelectedUser(null);
        }}
        user={selectedUser}
        onSuccess={handleFormSuccess}
      />

      {/* Reset Password Dialog */}
      {resetPasswordUser && (
        <ResetPasswordDialog
          isOpen={showResetPassword}
          onClose={() => {
            setShowResetPassword(false);
            setResetPasswordUser(null);
          }}
          userId={resetPasswordUser.id}
          userName={resetPasswordUser.name}
          onSuccess={() => {
            alert('Password reset successfully');
            fetchUsers(); // Refresh the list
          }}
        />
      )}
    </div>
  );
};

export default UsersPage;
