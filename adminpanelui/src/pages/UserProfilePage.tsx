import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { adminService, User } from '@/services/services';
import { 
  ArrowLeft, 
  Mail, 
  Phone, 
  MapPin, 
  User as UserIcon,
  Calendar,
  Wallet,
  Shield,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { walletService, WalletTransaction } from '@/services/services';

const UserProfilePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [txnPage, setTxnPage] = useState(1);
  const [txnTotal, setTxnTotal] = useState(0);
  const txnLimit = 10;

  useEffect(() => {
    if (id) {
      fetchUserProfile();
      fetchWalletTransactions(id, txnPage);
    }
    // eslint-disable-next-line
  }, [id, txnPage]);

  const fetchUserProfile = async () => {
    try {
      setIsLoading(true);
      setError('');
      const userData = await adminService.getUserById(id!);
      setUser(userData);
    } catch (err: any) {
      console.error('Failed to fetch user profile:', err);
      setError(err.response?.data?.message || 'Failed to load user profile');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchWalletTransactions = async (userId: string, page: number) => {
    try {
      const res = await walletService.getUserTransactions(userId, { page, limit: txnLimit });
      setTransactions(res.transactions || []);
      setTxnTotal(res.pagination?.total || 0);
    } catch (e) {
      setTransactions([]); setTxnTotal(0);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="space-y-6">
        <Button variant="outline" onClick={() => navigate('/users')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Users
        </Button>
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-red-600">
              {error || 'User not found'}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="outline" onClick={() => navigate('/users')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Users
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {user.first_name} {user.last_name}
            </h1>
            <p className="text-gray-600">User ID: {user.user_id}</p>
          </div>
        </div>
        <Badge className={
          user.status === 'active' ? 'bg-green-100 text-green-800' :
          user.status === 'banned' ? 'bg-red-100 text-red-800' :
          'bg-gray-100 text-gray-800'
        }>
          {user.status.toUpperCase()}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <UserIcon className="h-5 w-5" />
              <span>Basic Information</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-500">Full Name</label>
              <p className="text-lg font-semibold">{user.first_name} {user.last_name}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">User ID</label>
              <p className="text-lg">{user.user_id}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">User Type</label>
              <Badge variant="outline" className="mt-1">
                {user.user_type}
              </Badge>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Account Status</label>
              <div className="mt-1">
                <Badge className={
                  user.status === 'active' ? 'bg-green-100 text-green-800' :
                  user.status === 'banned' ? 'bg-red-100 text-red-800' :
                  'bg-gray-100 text-gray-800'
                }>
                  {user.status.toUpperCase()}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Phone className="h-5 w-5" />
              <span>Contact Information</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-500 flex items-center space-x-2">
                <Mail className="h-4 w-4" />
                <span>Email</span>
                {user.email_verified ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-gray-400" />
                )}
              </label>
              <p className="text-lg">{user.email}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500 flex items-center space-x-2">
                <Phone className="h-4 w-4" />
                <span>Mobile</span>
                {user.mobile_verified ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-gray-400" />
                )}
              </label>
              <p className="text-lg">{user.mobile}</p>
            </div>
            {user.alternate_mobile && (
              <div>
                <label className="text-sm font-medium text-gray-500">Alternate Mobile</label>
                <p className="text-lg">{user.alternate_mobile}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Address Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <MapPin className="h-5 w-5" />
              <span>Address Information</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {user.address && (
              <div>
                <label className="text-sm font-medium text-gray-500">Address</label>
                <p className="text-lg">{user.address}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              {user.city && (
                <div>
                  <label className="text-sm font-medium text-gray-500">City</label>
                  <p className="text-lg">{user.city}</p>
                </div>
              )}
              {user.state && (
                <div>
                  <label className="text-sm font-medium text-gray-500">State</label>
                  <p className="text-lg">{user.state}</p>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              {user.pin_code && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Pin Code</label>
                  <p className="text-lg">{user.pin_code}</p>
                </div>
              )}
              {user.region && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Region</label>
                  <p className="text-lg">{user.region}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Account Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Calendar className="h-5 w-5" />
              <span>Account Details</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-500 flex items-center space-x-2">
                <Wallet className="h-4 w-4" />
                <span>Wallet Balance</span>
              </label>
              <p className="text-lg font-semibold text-green-600">
                ₹{user.deposit_amount ? parseFloat(String(user.deposit_amount)).toFixed(2) : '0.00'}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Account Created</label>
              <p className="text-lg">
                {new Date(user.created_at).toLocaleString()}
              </p>
            </div>
            {user.last_login && (
              <div>
                <label className="text-sm font-medium text-gray-500">Last Login</label>
                <p className="text-lg">
                  {new Date(user.last_login).toLocaleString()}
                </p>
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-gray-500">Verification Status</label>
              <div className="mt-2 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Email Verified</span>
                  <Badge className={user.email_verified ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                    {user.email_verified ? 'Verified' : 'Not Verified'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Mobile Verified</span>
                  <Badge className={user.mobile_verified ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                    {user.mobile_verified ? 'Verified' : 'Not Verified'}
                  </Badge>
                </div>
                {user.is_email_verified_by_admin && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Email Verified by Admin</span>
                    <Badge className="bg-blue-100 text-blue-800">
                      <Shield className="h-3 w-3 mr-1" />
                      Verified
                    </Badge>
                  </div>
                )}
                {user.is_mobile_verified_by_admin && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Mobile Verified by Admin</span>
                    <Badge className="bg-blue-100 text-blue-800">
                      <Shield className="h-3 w-3 mr-1" />
                      Verified
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      {/* Wallet Transactions */}
      <Card>
        <CardHeader>
          <CardTitle>Wallet Transactions</CardTitle>
          <CardDescription>Recent wallet activities for this user</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Comment</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-gray-500">No transactions</TableCell></TableRow>
                ) : (
                  transactions.map(t => (
                    <TableRow key={t.id}>
                      <TableCell>{t.id}</TableCell>
                      <TableCell>{t.transaction_type}</TableCell>
                      <TableCell>{t.transaction_direction}</TableCell>
                      <TableCell>₹{t.amount.toFixed(2)}</TableCell>
                      <TableCell>{t.comment || '-'}</TableCell>
                      <TableCell>{new Date(t.created_at).toLocaleString()}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {/* Pagination */}
          {txnTotal > txnLimit && (
            <div className="flex items-center justify-between p-4">
              <div className="text-sm text-gray-700">
                Showing {transactions.length > 0 ? (txnPage - 1) * txnLimit + 1 : 0} to {transactions.length > 0 ? (txnPage - 1) * txnLimit + transactions.length : 0} of {txnTotal} transactions
              </div>
              <div className="flex space-x-2">
                <Button variant="outline" size="sm" onClick={() => setTxnPage(p => Math.max(p - 1, 1))} disabled={txnPage === 1}>Previous</Button>
                <Button variant="outline" size="sm" onClick={() => setTxnPage(p => Math.min(p + 1, Math.ceil(txnTotal / txnLimit)))} disabled={txnPage >= Math.ceil(txnTotal / txnLimit)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default UserProfilePage;

