import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { adminService } from '@/services/services';
import { Search, Clock, User } from 'lucide-react';

interface AuditLog {
  id: number;
  user_id?: number;
  admin_id?: number;
  action: string;
  target_type: string;
  target_id?: number;
  details: string;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

const AuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const limit = 20;

  useEffect(() => {
    fetchLogs();
  }, [currentPage, searchTerm]);

  const fetchLogs = async () => {
    try {
      setIsLoading(true);
      const params: any = {
        page: currentPage,
        limit,
      };
      
      if (searchTerm) {
        params.search = searchTerm;
      }

      const response = await adminService.getAuditLogs(params);
      setLogs(response.logs || []);
      setTotalLogs(response.total || 0);
    } catch (err: any) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const getActionBadge = (action: string) => {
    const actionColors: Record<string, string> = {
      'user_created': 'bg-green-100 text-green-800',
      'user_updated': 'bg-blue-100 text-blue-800',
      'user_deleted': 'bg-red-100 text-red-800',
      'user_banned': 'bg-red-100 text-red-800',
      'user_activated': 'bg-green-100 text-green-800',
      'password_reset': 'bg-orange-100 text-orange-800',
      'email_verified': 'bg-green-100 text-green-800',
      'mobile_verified': 'bg-green-100 text-green-800',
      'sessions_killed': 'bg-purple-100 text-purple-800',
      'settings_updated': 'bg-indigo-100 text-indigo-800',
      'wallet_transaction': 'bg-yellow-100 text-yellow-800',
    };
    
    return actionColors[action] || 'bg-gray-100 text-gray-800';
  };

  const filteredLogs = logs.filter(log => 
    log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.target_type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(totalLogs / limit);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Audit Logs</h1>
        <p className="text-gray-600">Complete history of admin actions and system changes</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filter Logs</CardTitle>
          <CardDescription>Search through audit logs by action, details, or target type</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by action, details, or target type..."
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
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Target Type</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>IP Address</TableHead>
                    <TableHead>Admin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                        No audit logs found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-medium">{log.id}</TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Clock className="h-4 w-4 text-gray-400" />
                            <span>{new Date(log.created_at).toLocaleString()}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getActionBadge(log.action)}>
                            {log.action.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{log.target_type}</Badge>
                        </TableCell>
                        <TableCell className="max-w-md truncate">{log.details}</TableCell>
                        <TableCell className="text-sm text-gray-500">{log.ip_address || '-'}</TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <User className="h-4 w-4 text-gray-400" />
                            <span>{log.admin_id || 'System'}</span>
                          </div>
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
          Showing {totalLogs > 0 ? ((currentPage - 1) * limit) + 1 : 0} to {Math.min(currentPage * limit, totalLogs)} of {totalLogs} logs
        </div>
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1 || totalLogs === 0}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages || totalLogs === 0}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AuditLogsPage;
