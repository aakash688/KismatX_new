import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { walletService, adminService, User, WalletLog, WalletSummary } from '@/services/services';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Plus, RefreshCw, FileDown } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const WalletManagementPage: React.FC = () => {
  const [logs, setLogs] = useState<WalletLog[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [error, setError] = useState('');
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [userId, setUserId] = useState<string>('all');
  const [transactionType, setTransactionType] = useState<string>('all');
  const [direction, setDirection] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const limit = 20;
  const [total, setTotal] = useState(0);
  // Export
  const exportToCSV = () => {
    if (!logs || logs.length === 0) {
      alert('No logs to export');
      return;
    }
    const headers = [
      'ID', 'User', 'User Code', 'Type', 'Direction', 'Amount', 'Comment', 'Date'
    ];
    const rows = logs.map(l => [
      l.id,
      l.user_name || '',
      l.user_code || '',
      l.transaction_type,
      l.transaction_direction,
      l.amount,
      l.comment,
      new Date(l.created_at).toLocaleString()
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wallet_logs_${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const [showTxnDialog, setShowTxnDialog] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [txnForm, setTxnForm] = useState({
    user_id: '',
    transaction_type: 'recharge',
    amount: 0,
    transaction_direction: 'credit',
    comment: ''
  });
  const [txnError, setTxnError] = useState('');
  const [txnLoading, setTxnLoading] = useState(false);
  const [txnSuccess, setTxnSuccess] = useState('');
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  function handleStartTxn() {
    setTxnForm({ user_id: '', transaction_type: 'recharge', amount: 0, transaction_direction: 'credit', comment: '' });
    setUserSearchTerm('');
    setTxnError('');
    setTxnSuccess('');
    setShowTxnDialog(true);
  }
  async function handleTxnSubmit() {
    setTxnError(''); setTxnSuccess('');
    if (!txnForm.user_id || !txnForm.amount || txnForm.amount <= 0) {
      setTxnError('Please fill all fields and ensure amount is greater than 0'); 
      return;
    }
    
    // Validate withdrawal won't go negative
    if (txnForm.transaction_type === 'withdrawal' && txnForm.transaction_direction === 'debit') {
      const selectedUser = users.find(u => u.id.toString() === txnForm.user_id);
      const currentBalance = parseFloat(String(selectedUser?.deposit_amount || 0));
      if (txnForm.amount > currentBalance) {
        setTxnError(`Insufficient balance! Current balance: ₹${currentBalance.toFixed(2)}, Withdrawal amount: ₹${txnForm.amount.toFixed(2)}`);
        return;
      }
    }
    
    setTxnLoading(true);
    try {
      const req = {
        user_id: Number(txnForm.user_id),
        transaction_type: txnForm.transaction_type as 'recharge' | 'withdrawal' | 'game',
        amount: Number(txnForm.amount),
        transaction_direction: txnForm.transaction_direction as 'credit' | 'debit',
        comment: txnForm.comment || ''
      };
      
      console.log('📤 Creating transaction:', req);
      const res = await walletService.createTransaction(req);
      console.log('✅ Transaction successful:', res);
      
      const successMsg = `Transaction completed successfully! New balance: ₹${res.user.new_balance.toFixed(2)}`;
      setTxnSuccess(successMsg);
      
      // Show success message on main page
      setShowSuccessMessage(true);
      
      // Close dialog after a short delay to show success message
      setTimeout(() => {
        setShowTxnDialog(false);
        setTxnForm({ user_id: '', transaction_type: 'recharge', amount: 0, transaction_direction: 'credit', comment: '' });
        setUserSearchTerm('');
        setTxnSuccess('');
      }, 1500);
      
      // Hide success message after 5 seconds
      setTimeout(() => {
        setShowSuccessMessage(false);
      }, 5000);
      
      fetchLogs();
      if (userId === txnForm.user_id || userId === 'all') {
        walletService.getUserWalletSummary(txnForm.user_id).then(setSummary).catch(() => {});
      }
    } catch(e: any) {
      console.error('❌ Transaction error:', e);
      const errorMsg = e.response?.data?.message || e.message || 'Transaction failed. Please check if the server is running.';
      setTxnError(errorMsg);
    } finally {
      setTxnLoading(false);
    }
  }
  // Load user list (for filter) - only players, exclude admins
  useEffect(() => {
        setIsLoadingUsers(true);
    adminService.getUsers({ page: 1, limit: 1000 })
      .then(res => {
        // Filter to show only players (exclude admins and moderators)
        const playersOnly = (res.users || []).filter(u => u.user_type === 'player');
        setUsers(playersOnly);
      })
      .catch(() => setUsers([]))
      .finally(() => setIsLoadingUsers(false));
  }, []);
  // Fetch logs
  const fetchLogs = async () => {
          setIsLoading(true);
          setError('');
    try {
        const params: any = { page: currentPage, limit };
      if (userId && userId !== 'all') params.user_id = userId;
      if (searchTerm) params.search = searchTerm;
      if (transactionType !== 'all') params.transaction_type = transactionType;
      if (direction !== 'all') params.direction = direction;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const res = await walletService.getAllWalletLogs(params);
      console.log('📊 Wallet logs response:', res);
      setLogs(Array.isArray(res?.logs) ? res.logs : []);
      setTotal(res?.pagination?.total || 0);
    } catch (err: any) {
      console.error('❌ Error fetching wallet logs:', err);
      setError(err.response?.data?.message || err.message || 'Failed to load logs');
      setLogs([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  };
  // Load logs and user summary if user selected
  useEffect(() => {
    fetchLogs();
    if (userId && userId !== 'all') {
      walletService.getUserWalletSummary(userId).then(setSummary).catch(() => setSummary(null));
    } else {
      setSummary(null);
    }
    // eslint-disable-next-line
  }, [currentPage, limit, userId, searchTerm, transactionType, direction, dateFrom, dateTo]);

  const totalPages = Math.ceil(total / limit) || 1;
  const handleRefresh = () => fetchLogs();

  return (
    <div className="space-y-6 p-6">
      {/* Success Message Banner */}
      {showSuccessMessage && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg flex items-center justify-between animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium">{txnSuccess || 'Transaction completed successfully!'}</span>
          </div>
          <button
            onClick={() => setShowSuccessMessage(false)}
            className="text-green-600 hover:text-green-800 ml-4"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Wallet Management</h1>
          <p className="text-gray-600">All wallet transactions for all users. Filter by user, type, direction, date range.</p>
        </div>
        <TooltipProvider>
          <div className="flex gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Dialog open={showTxnDialog} onOpenChange={setShowTxnDialog}>
                  <DialogTrigger asChild>
                    <Button onClick={handleStartTxn} variant="ghost" size="icon"><Plus className="w-5 h-5" /></Button>
                  </DialogTrigger>
                  <DialogContent className="bg-white max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Create Wallet Transaction</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Select User</Label>
                        <Select value={txnForm.user_id} onValueChange={v => {
                          setTxnForm(f => ({ ...f, user_id: v }));
                          const selectedUser = users.find(u => u.id.toString() === v);
                          if (selectedUser) {
                            setUserSearchTerm('');
                          }
                        }}>
                          <SelectTrigger id="user-select" className="w-full">
                            <SelectValue placeholder="Search or select a user..." />
                          </SelectTrigger>
                          <SelectContent className="z-[100]">
                            <div className="p-2 border-b sticky top-0 bg-white z-10">
                              <Input
                                placeholder="Type to search by name or user ID..."
                                value={userSearchTerm}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  setUserSearchTerm(e.target.value);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="h-9"
                              />
                            </div>
                            <div className="max-h-[200px] overflow-y-auto">
                              {users.filter(u => {
                                if (!userSearchTerm) return true;
                                const search = userSearchTerm.toLowerCase();
                                const fullName = `${u.first_name} ${u.last_name}`.toLowerCase();
                                const userId = u.user_id?.toLowerCase() || '';
                                return fullName.includes(search) || userId.includes(search);
                              }).sort((a, b) => a.user_id.localeCompare(b.user_id)).map(u => (
                                <SelectItem key={u.id} value={u.id.toString()}>
                                  {u.first_name} {u.last_name} ({u.user_id}) - ₹{parseFloat(String(u.deposit_amount || 0)).toFixed(2)}
                                </SelectItem>
                              ))}
                            </div>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Type</Label>
                        <Select value={txnForm.transaction_type} onValueChange={type => {
                          setTxnForm(f => ({
                            ...f,
                            transaction_type: type,
                            transaction_direction: type === 'recharge' ? 'credit' : type === 'withdrawal' ? 'debit' : f.transaction_direction,
                          }));
                        }}>
                          <SelectTrigger id="txn-type"><SelectValue /></SelectTrigger>
                          <SelectContent className="z-[100]">
                            <SelectItem value="recharge">Recharge (Add Money - Credit)</SelectItem>
                            <SelectItem value="withdrawal">Withdrawal (Deduct Money - Debit)</SelectItem>
                            <SelectItem value="game">Game Transaction</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {txnForm.transaction_type === 'game' && (
                        <div>
                          <Label>Direction</Label>
                          <Select value={txnForm.transaction_direction} onValueChange={direction => setTxnForm(f => ({ ...f, transaction_direction: direction }))}>
                            <SelectTrigger id="txn-dir"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="credit">Credit (Win)</SelectItem>
                              <SelectItem value="debit">Debit (Loss)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div>
                        <Label>Amount (₹)</Label>
                        <Input type="number" min="0" step="0.01" value={txnForm.amount || ''} onChange={e => setTxnForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} placeholder="Enter amount" />
                      </div>
                      <div>
                        <Label>Comment</Label>
                        <Textarea value={txnForm.comment} onChange={e => setTxnForm(f => ({ ...f, comment: e.target.value }))} placeholder="Optional note" rows={2} />
                      </div>
                      {txnError && <div className="text-red-600 text-sm">{txnError}</div>}
                      {txnSuccess && <div className="text-green-600 text-sm">{txnSuccess}</div>}
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setShowTxnDialog(false)}>Cancel</Button>
                        <Button onClick={handleTxnSubmit} disabled={txnLoading}>{txnLoading ? 'Processing...' : 'Submit'}</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </TooltipTrigger>
              <TooltipContent>New Transaction</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={handleRefresh} variant="ghost" size="icon"><RefreshCw className="w-5 h-5" /></Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={exportToCSV} variant="ghost" size="icon"><FileDown className="w-5 h-5" /></Button>
              </TooltipTrigger>
              <TooltipContent>Export CSV</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>
      {/* Filters */}
      <div className="bg-white rounded-xl shadow p-4 flex flex-wrap gap-4 items-end">
              <div>
          <Label>User</Label>
          <Select disabled={isLoadingUsers} value={userId} onValueChange={val => { setUserId(val); setCurrentPage(1); }}>
            <SelectTrigger className="min-w-[220px]">
              <SelectValue placeholder="All Users" />
                  </SelectTrigger>
                  <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              {users.map(u => (
                <SelectItem key={u.id} value={u.id.toString()}>
                  {u.first_name} {u.last_name} ({u.user_id}) - ₹{parseFloat(String(u.deposit_amount || 0)).toFixed(2)}
                </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
          <Label>Type</Label>
          <Select value={transactionType} onValueChange={v => { setTransactionType(v); setCurrentPage(1); }}>
            <SelectTrigger><SelectValue placeholder="All Types" /></SelectTrigger>
                  <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="recharge">Recharge</SelectItem>
              <SelectItem value="withdrawal">Withdrawal</SelectItem>
              <SelectItem value="game">Game</SelectItem>
                  </SelectContent>
                </Select>
              </div>
                <div>
          <Label>Direction</Label>
          <Select value={direction} onValueChange={v => { setDirection(v); setCurrentPage(1); }}>
            <SelectTrigger><SelectValue placeholder="All Directions" /></SelectTrigger>
                    <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="credit">Credit</SelectItem>
              <SelectItem value="debit">Debit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              <div>
          <Label>Date From</Label>
          <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setCurrentPage(1); }} />
              </div>
              <div>
          <Label>Date To</Label>
          <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setCurrentPage(1); }} />
              </div>
        <div className="flex-1 min-w-[180px]">
          <Label>Search</Label>
          <Input placeholder="Search by name, code, comment..." value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }} />
            </div>
      </div>
      {/* Summary For User */}
      {summary && (
        <Card>
          <CardHeader>
            <CardTitle>Wallet Summary for {summary.user.first_name} {summary.user.last_name} ({summary.user.user_id})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-8 text-lg">
              <div>Balance: <span className="font-bold text-green-600">₹{summary.balance.toFixed(2)}</span></div>
              <div>Total Credits: <span className="font-bold">₹{summary.total_credits.toFixed(2)}</span></div>
              <div>Total Debits: <span className="font-bold">₹{summary.total_debits.toFixed(2)}</span></div>
              <div>Total Transactions: <span className="font-bold">{summary.total_transactions}</span></div>
            </div>
          </CardContent>
        </Card>
      )}
      {/* Data Table */}
        <Card>
          <CardHeader>
          <CardTitle>Wallet Logs</CardTitle>
          </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
          ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>User Code</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Direction</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Comment</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                  {!logs || logs.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-gray-500">No logs found</TableCell></TableRow>
                  ) : (
                    logs.map(l => (
                      <TableRow key={l.id}>
                        <TableCell className="font-medium">{l.id}</TableCell>
                        <TableCell>{l.user_name || '-'}</TableCell>
                        <TableCell>{l.user_code || '-'}</TableCell>
                        <TableCell>{l.transaction_type}</TableCell>
                        <TableCell>{l.transaction_direction}</TableCell>
                        <TableCell>₹{l.amount.toFixed(2)}</TableCell>
                        <TableCell className="text-sm text-gray-600 max-w-xs truncate">{l.comment || '-'}</TableCell>
                        <TableCell className="text-sm text-gray-500">{new Date(l.created_at).toLocaleString()}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
          )}
        </CardContent>
      </Card>
      {/* Pagination Controls */}
      {total > 0 && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700">
            Showing {((currentPage - 1) * limit) + 1} to {Math.min(currentPage * limit, total)} of {total} logs
              </div>
              <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1}>Previous</Button>
                <div className="flex items-center space-x-1">
                  <span className="text-sm text-gray-600">Page</span>
                  <span className="text-sm font-medium">{currentPage}</span>
                  <span className="text-sm text-gray-600">of</span>
              <span className="text-sm font-medium">{totalPages}</span>
                </div>
            <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage >= totalPages}>Next</Button>
              </div>
            </div>
      )}
      {/* Error Message */}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mt-4">{error}</div>}
    </div>
  );
};
export default WalletManagementPage;
