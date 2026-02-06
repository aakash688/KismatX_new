import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { adminService, LoginHistory } from '@/services/services';
import { Search, Clock, User, CheckCircle, XCircle } from 'lucide-react';

const LoginHistoryPage: React.FC = () => {
  const [logins, setLogins] = useState<LoginHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalLogins, setTotalLogins] = useState(0);
  const limit = 20;

  useEffect(() => {
    fetchLogins();
  }, [currentPage, searchTerm]);

  const fetchLogins = async () => {
    try {
      setIsLoading(true);
      const params: any = {
        page: currentPage,
        limit,
      };
      
      if (searchTerm) {
        params.search = searchTerm;
      }

      const response = await adminService.getLoginHistory(params);
      setLogins(response.logins || []);
      setTotalLogins(response.total || 0);
    } catch (err: any) {
      console.error('Failed to load login history:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredLogins = logins.filter(login => 
    (login.user_id?.toString().includes(searchTerm)) ||
    (login.ip_address?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const totalPages = Math.ceil(totalLogins / limit);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Login History</h1>
        <p className="text-gray-600">Track all login attempts and authentication events</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filter Logins</CardTitle>
          <CardDescription>Search through login history by user ID, email, or IP address</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by user ID, email, or IP address..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
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
                    <TableHead>ID</TableHead>
                    <TableHead>Login Time</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>IP Address</TableHead>
                    <TableHead>User Agent</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogins.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                        No login history found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredLogins.map((login) => (
                      <TableRow key={login.id}>
                        <TableCell className="font-medium">{login.id}</TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Clock className="h-4 w-4 text-gray-400" />
                            <span>{new Date(login.login_time).toLocaleString()}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <User className="h-4 w-4 text-gray-400" />
                            <span>{login.user_id || 'Unknown'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">{login.ip_address || '-'}</TableCell>
                        <TableCell className="max-w-md truncate text-sm text-gray-500">
                          {login.user_agent || '-'}
                        </TableCell>
                        <TableCell>
                          {login.is_successful ? (
                            <Badge className="bg-green-100 text-green-800">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Success
                            </Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-800">
                              <XCircle className="h-3 w-3 mr-1" />
                              Failed
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {login.failure_reason || 'Login successful'}
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
          Showing {totalLogins > 0 ? ((currentPage - 1) * limit) + 1 : 0} to {Math.min(currentPage * limit, totalLogins)} of {totalLogins} logins
        </div>
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1 || totalLogins === 0}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages || totalLogins === 0}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LoginHistoryPage;
