import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { gameService, Game } from '@/services/services';
import { Search, Eye, Calendar, TrendingUp, TrendingDown, Clock, AlertCircle, ChevronDown, ChevronUp, Trophy } from 'lucide-react';

const GamesPage: React.FC = () => {
  const navigate = useNavigate();
  
  // Get today's date in YYYY-MM-DD format for default filter
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [games, setGames] = useState<Game[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalGames, setTotalGames] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [settlementFilter, setSettlementFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>(getTodayDate()); // Default to today
  const [limit, setLimit] = useState<number>(10); // Default 10 per page
  const [showSettlementInfo, setShowSettlementInfo] = useState<boolean>(false); // Collapsible settlement info

  useEffect(() => {
    setCurrentPage(1); // Reset to page 1 when filters or limit change
  }, [statusFilter, settlementFilter, dateFilter, limit]);

  useEffect(() => {
    fetchGames();
  }, [currentPage, statusFilter, settlementFilter, dateFilter, limit]);

  const fetchGames = async () => {
    try {
      setIsLoading(true);
      setError('');

      const params: any = {
        page: currentPage,
        limit,
      };

      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }

      if (settlementFilter !== 'all') {
        params.settlement_status = settlementFilter;
      }

      // Always include date filter (defaults to today)
      if (dateFilter) {
        params.date = dateFilter;
      }

      const response = await gameService.listGames(params);
      setGames(response.data);
      setTotalGames(response.pagination?.total || 0);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load games');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      pending: 'outline',
      active: 'default',
      completed: 'secondary',
    };
    return <Badge variant={variants[status] || 'outline'}>{status}</Badge>;
  };

  const getSettlementBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      not_settled: 'outline',
      settling: 'default',
      settled: 'default',
      error: 'destructive',
    };
    const labels: Record<string, string> = {
      not_settled: 'Not Settled',
      settling: 'Settling',
      settled: 'Settled',
      error: 'Error',
    };
    return <Badge variant={variants[status] || 'outline'}>{labels[status] || status}</Badge>;
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const totalPages = Math.ceil(totalGames / limit) || 1;
  
  const handleLimitChange = (newLimit: string) => {
    setLimit(Number(newLimit));
    setCurrentPage(1);
  };
  
  const handleDateFilterChange = (value: string) => {
    setDateFilter(value);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Games Management</h1>
          <p className="text-gray-600 mt-1">View and manage all games</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Settlement Status</label>
              <Select value={settlementFilter} onValueChange={setSettlementFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="not_settled">Not Settled</SelectItem>
                  <SelectItem value="settling">Settling</SelectItem>
                  <SelectItem value="settled">Settled</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Date</label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => handleDateFilterChange(e.target.value)}
                  placeholder="Filter by date"
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDateFilter(getTodayDate());
                    setCurrentPage(1);
                  }}
                  title="Reset to today"
                >
                  Today
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDateFilter('');
                    setCurrentPage(1);
                  }}
                  title="Show all dates"
                >
                  All
                </Button>
              </div>
            </div>

            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => {
                  setStatusFilter('all');
                  setSettlementFilter('all');
                  setDateFilter(getTodayDate()); // Reset to today instead of clearing
                  setCurrentPage(1);
                }}
                className="w-full"
              >
                Reset Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Games Table */}
      <Card>
        <CardHeader>
          <CardTitle>Games List</CardTitle>
          <CardDescription>
            Total: {totalGames} games
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-600">{error}</p>
              <Button onClick={fetchGames} className="mt-4" variant="outline">
                Retry
              </Button>
            </div>
          ) : games.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No games found</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Game ID</TableHead>
                      <TableHead>Start Time</TableHead>
                      <TableHead>End Time</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Settlement</TableHead>
                      <TableHead>Total Wagered</TableHead>
                      <TableHead>Winning Card</TableHead>
                      <TableHead>Multiplier</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {games.map((game) => (
                      <TableRow key={game.id}>
                        <TableCell className="font-mono font-medium">
                          {game.game_id}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-gray-400" />
                            {formatDateTime(game.start_time)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-gray-400" />
                            {formatDateTime(game.end_time)}
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(game.status)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getSettlementBadge(game.settlement_status)}
                            <Tooltip>
                              <TooltipTrigger>
                                <AlertCircle className="h-4 w-4 text-gray-400 cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="max-w-xs">
                                  <p className="font-semibold mb-1">Settlement Status:</p>
                                  <p className="text-xs mb-2">
                                    <strong>Not Settled:</strong> Game ended but winning card not declared yet
                                  </p>
                                  <p className="text-xs mb-2">
                                    <strong>Settling:</strong> Settlement process in progress
                                  </p>
                                  <p className="text-xs mb-2">
                                    <strong>Settled:</strong> Winning card declared, payouts calculated
                                  </p>
                                  <p className="text-xs">
                                    <strong>Note:</strong> Individual slip settlement happens when player scans barcode to claim winnings
                                  </p>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">
                            ₹{game.total_wagered?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                          </div>
                        </TableCell>
                        <TableCell>
                          {game.winning_card ? (
                            <Badge variant="default">Card {game.winning_card}</Badge>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{game.payout_multiplier}x</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/games/${game.game_id}`)}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View
                            </Button>
                            {game.status === 'completed' && game.settlement_status === 'not_settled' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate(`/games/${game.game_id}/settle`)}
                              >
                                <Trophy className="h-4 w-4 mr-2" />
                                Settle
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex flex-col gap-4 mt-4 pt-4 border-t">
                {/* Top Row: Entries per page and Status */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Show</span>
                    <Select value={limit.toString()} onValueChange={handleLimitChange}>
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-sm text-gray-600">entries per page</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    {totalGames > 0 ? (
                      <>Showing {((currentPage - 1) * limit) + 1} to {Math.min(currentPage * limit, totalGames)} of {totalGames} games</>
                    ) : (
                      <>No games found</>
                    )}
                  </div>
                </div>

                {/* Bottom Row: Page Navigation */}
                {totalGames > 0 && (
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1 || isLoading}
                    >
                      First
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1 || isLoading}
                    >
                      Previous
                    </Button>
                    <div className="flex items-center gap-1 px-3">
                      <span className="text-sm font-medium">Page</span>
                      <span className="text-sm font-bold">{currentPage}</span>
                      <span className="text-sm text-gray-500">of</span>
                      <span className="text-sm font-bold">{totalPages}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages || isLoading}
                    >
                      Next
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages || isLoading}
                    >
                      Last
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Settlement Info Card - Collapsible at bottom */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader 
          className="cursor-pointer hover:bg-blue-100 transition-colors"
          onClick={() => setShowSettlementInfo(!showSettlementInfo)}
        >
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-blue-600" />
              Understanding Settlement Status
            </div>
            {showSettlementInfo ? (
              <ChevronUp className="h-5 w-5 text-blue-600" />
            ) : (
              <ChevronDown className="h-5 w-5 text-blue-600" />
            )}
          </CardTitle>
        </CardHeader>
        {showSettlementInfo && (
          <CardContent>
            <div className="space-y-2 text-sm text-gray-700">
              <p>
                <strong>Game Settlement:</strong> The process where admin declares the winning card and the system calculates payouts for all winning bets.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
                <div className="p-3 bg-white rounded border">
                  <div className="font-semibold text-xs text-gray-600 mb-1">Not Settled</div>
                  <div className="text-xs">Game ended, but winning card not declared yet. Admin needs to settle the game.</div>
                </div>
                <div className="p-3 bg-white rounded border">
                  <div className="font-semibold text-xs text-gray-600 mb-1">Settling</div>
                  <div className="text-xs">Settlement process in progress. Payouts are being calculated.</div>
                </div>
                <div className="p-3 bg-white rounded border">
                  <div className="font-semibold text-xs text-gray-600 mb-1">Settled</div>
                  <div className="text-xs">Winning card declared, all payouts calculated. Players can now claim winnings.</div>
                </div>
                <div className="p-3 bg-white rounded border">
                  <div className="font-semibold text-xs text-gray-600 mb-1">Individual Claims</div>
                  <div className="text-xs">When a player scans their barcode, their specific slip is marked as claimed. This is separate from game settlement.</div>
                </div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
};

export default GamesPage;

