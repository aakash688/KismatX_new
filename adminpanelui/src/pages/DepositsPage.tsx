import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { adminService } from '@/services/services';
import { Search, DollarSign, TrendingUp, TrendingDown, User } from 'lucide-react';

interface Deposit {
  id: number;
  user_id: string;
  user_name: string;
  email: string;
  mobile: string;
  deposit_amount: number;
  transaction_type: 'deposit' | 'withdrawal';
  status: 'pending' | 'completed' | 'failed';
  transaction_date: string;
  notes?: string;
}

const DepositsPage: React.FC = () => {
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [allDeposits, setAllDeposits] = useState<Deposit[]>([]); // Store all deposits for totals
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed' | 'failed'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalDeposits, setTotalDeposits] = useState(0);
  const limit = 20;

  useEffect(() => {
    // Only fetch if currentPage is a valid number
    if (!isNaN(currentPage) && currentPage >= 1) {
      fetchDeposits();
    }
  }, [currentPage, searchTerm, statusFilter]);

  // Reset to page 1 when search or filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  useEffect(() => {
    // Fetch all deposits for totals calculation
    fetchAllDeposits();
  }, []);

  const fetchAllDeposits = async () => {
    try {
      // Fetch all users without pagination to calculate totals
      const response = await adminService.getUsers({
        page: 1,
        limit: 1000, // Get all users
      });
      
      const allDepositRecords: Deposit[] = response.users.map((user: any) => ({
        id: user.id,
        user_id: user.user_id,
        user_name: `${user.first_name} ${user.last_name}`,
        deposit_amount: parseFloat(user.deposit_amount) || 0,
        transaction_type: 'deposit' as const,
        status: 'completed' as const,
        transaction_date: user.created_at,
        notes: 'Initial deposit',
        email: user.email,
        mobile: user.mobile,
      }));
      
      setAllDeposits(allDepositRecords);
    } catch (err: any) {
      console.error('Failed to load all deposits:', err);
      setAllDeposits([]);
    }
  };

  const fetchDeposits = async () => {
    try {
      setIsLoading(true);
      // Since we don't have a deposits API yet, we'll fetch users and show their deposit amounts
      const response = await adminService.getUsers({
        page: currentPage,
        limit,
      });
      
      // Transform user data into deposit records
      const depositRecords: Deposit[] = response.users.map((user: any) => ({
        id: user.id,
        user_id: user.user_id,
        user_name: `${user.first_name} ${user.last_name}`,
        deposit_amount: parseFloat(user.deposit_amount) || 0,
        transaction_type: 'deposit' as const,
        status: 'completed' as const,
        transaction_date: user.created_at,
        notes: 'Initial deposit',
        email: user.email,
        mobile: user.mobile,
      }));
      
      setDeposits(depositRecords);
      // Ensure total is a valid number
      const total = parseInt(response.pagination?.total || response.total || 0, 10);
      setTotalDeposits(isNaN(total) ? 0 : total);
    } catch (err: any) {
      console.error('Failed to load deposits:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredDeposits = deposits.filter(deposit => {
    const matchesSearch = 
      deposit.user_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      deposit.user_name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || deposit.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  /**
   * Calculate Wallet Balance:
   * - Sums all deposit_amount values from allDeposits array
   * - allDeposits contains ALL users (fetched with limit: 1000)
   * - Each deposit_amount is parsed as float to ensure it's a number
   * - Returns 0 if calculation fails
   */
  const totalDepositAmount = allDeposits.reduce((sum, d) => {
    const amount = parseFloat(String(d.deposit_amount)) || 0;
    return sum + amount;
  }, 0);
  
  /**
   * Calculate Total Withdrawals:
   * - Currently set to 0 as there's no withdrawal system yet
   * - When withdrawals are implemented, this should sum all withdrawal amounts
   */
  const totalWithdrawalAmount = 0; // No withdrawals yet
  
  /**
   * Calculate Net Balance:
   * - Net Balance = Wallet Balance - Total Withdrawals
   * - Represents the actual balance after all transactions
   */
  const netBalance = totalDepositAmount - totalWithdrawalAmount;
  
  // Pagination variables
  const totalUsers = totalDeposits || 0;
  const totalPages = Math.ceil(totalUsers / limit);
  const filteredCount = filteredDeposits.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Deposits Management</h1>
        <p className="text-gray-600">User-wise deposit tracking and management</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Wallet Balance</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              ₹{isNaN(totalDepositAmount) ? '0.00' : totalDepositAmount.toFixed(2)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Withdrawals</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              ₹{isNaN(totalWithdrawalAmount) ? '0.00' : totalWithdrawalAmount.toFixed(2)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              ₹{isNaN(netBalance) ? '0.00' : netBalance.toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

        <Card>
          <CardHeader>
            <CardTitle>Filter Users</CardTitle>
            <CardDescription>Search and filter users by wallet balance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative flex-1 md:col-span-2">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by user ID or name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Mobile</TableHead>
                    <TableHead>Wallet Balance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Account Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDeposits.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                        No users found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredDeposits.map((deposit) => (
                      <TableRow key={deposit.id}>
                        <TableCell className="font-medium">{deposit.user_id}</TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <User className="h-4 w-4 text-gray-400" />
                            <span>{deposit.user_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{deposit.email}</TableCell>
                        <TableCell className="text-sm">{deposit.mobile}</TableCell>
                        <TableCell className="font-medium text-green-600">
                          ₹{parseFloat(String(deposit.deposit_amount)).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge className={
                            deposit.status === 'completed' ? 'bg-green-100 text-green-800' :
                            deposit.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }>
                            {deposit.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {new Date(deposit.transaction_date).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-700">
          {filteredCount > 0 ? (
            <>
              Showing {((currentPage - 1) * limit) + 1} to {Math.min(currentPage * limit, totalUsers)} of {totalUsers} {totalUsers === 1 ? 'user' : 'users'}
              {searchTerm && ` (${filteredCount} filtered)`}
            </>
          ) : (
            'No users found'
          )}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1 || totalUsers === 0}
          >
            Previous
          </Button>
          <div className="flex items-center space-x-1">
            <span className="text-sm text-gray-600">Page</span>
            <span className="text-sm font-medium">{currentPage}</span>
            <span className="text-sm text-gray-600">of</span>
            <span className="text-sm font-medium">{totalPages || 1}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage >= totalPages || totalUsers === 0}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DepositsPage;
