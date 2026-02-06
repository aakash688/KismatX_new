import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { gameService, GameStats, GameBet, SettlementReport, GameUserStat } from '@/services/services';
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign, Users, Trophy, AlertCircle, CheckCircle2 } from 'lucide-react';

const GameDetailPage: React.FC = () => {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const [stats, setStats] = useState<GameStats | null>(null);
  const [bets, setBets] = useState<GameBet[]>([]);
  const [settlementReport, setSettlementReport] = useState<SettlementReport | null>(null);
  const [userStats, setUserStats] = useState<GameUserStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('stats');
  const [showSettleDialog, setShowSettleDialog] = useState(false);
  const [winningCard, setWinningCard] = useState<number>(1);
  const [isSettling, setIsSettling] = useState(false);
  const [betsPage, setBetsPage] = useState(1);
  const [betsTotal, setBetsTotal] = useState(0);
  const betsLimit = 50;

  useEffect(() => {
    if (gameId) {
      fetchGameData();
    }
  }, [gameId, activeTab, betsPage]);

  const fetchGameData = async () => {
    if (!gameId) return;

    try {
      setIsLoading(true);
      setError('');

      // Always fetch stats
      const statsResponse = await gameService.getGameStats(gameId);
      // Handle both response formats: { data: {...} } or just {...}
      const finalStats = (statsResponse as any).data || statsResponse;
      
      if (!finalStats || !finalStats.game) {
        throw new Error('Invalid game stats response');
      }
      
      setStats(finalStats);

      // Fetch data based on active tab
      if (activeTab === 'bets') {
        const betsData = await gameService.getGameBets(gameId, {
          page: betsPage,
          limit: betsLimit,
        });
        setBets(betsData.data || []);
        setBetsTotal(betsData.pagination?.total || 0);
      } else if (activeTab === 'users') {
        const usersData = await gameService.getGameUserStats(gameId);
        // Handle both response formats: { data: [...] } or just [...]
        const finalUsers = Array.isArray(usersData) ? usersData : (usersData as any)?.data || [];
        setUserStats(finalUsers);
      } else if (activeTab === 'settlement' && finalStats.game.settlement_status === 'settled') {
        try {
          const reportData = await gameService.getSettlementReport(gameId);
          setSettlementReport((reportData as any).data || reportData);
        } catch (reportErr: any) {
          console.error('Error loading settlement report:', reportErr);
          // Don't fail the whole page if settlement report fails
        }
      }
    } catch (err: any) {
      console.error('Error loading game data:', err);
      setError(err.response?.data?.message || err.message || 'Failed to load game data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSettleGame = async () => {
    if (!gameId) return;

    try {
      setIsSettling(true);
      await gameService.settleGame(gameId, { winning_card: winningCard });
      setShowSettleDialog(false);
      // Refresh data
      await fetchGameData();
      setActiveTab('stats');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to settle game');
    } finally {
      setIsSettling(false);
    }
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  if (isLoading && !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">{error}</p>
        <Button onClick={() => navigate('/games')} className="mt-4" variant="outline">
          Back to Games
        </Button>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const { game, statistics, card_totals = [] } = stats;
  const canSettle = game.status === 'completed' && game.settlement_status === 'not_settled';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/games')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Game: {game.game_id}</h1>
            <p className="text-gray-600 mt-1">
              {formatDateTime(game.start_time)} - {formatDateTime(game.end_time)}
            </p>
          </div>
        </div>
        {canSettle && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(`/games/${game.game_id}/settle`)}>
              <Trophy className="h-4 w-4 mr-2" />
              Manual Settlement (Advanced)
            </Button>
            <Button onClick={() => setShowSettleDialog(true)}>
              <Trophy className="h-4 w-4 mr-2" />
              Quick Settle
            </Button>
          </div>
        )}
      </div>

      {/* Game Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Status</CardDescription>
          </CardHeader>
          <CardContent>
            <Badge variant={game.status === 'active' ? 'default' : game.status === 'completed' ? 'secondary' : 'outline'}>
              {game.status}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Settlement</CardDescription>
          </CardHeader>
          <CardContent>
            <Badge variant={game.settlement_status === 'settled' ? 'default' : game.settlement_status === 'error' ? 'destructive' : 'outline'}>
              {game.settlement_status.replace('_', ' ')}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Winning Card</CardDescription>
          </CardHeader>
          <CardContent>
            {game.winning_card ? (
              <Badge variant="default" className="text-lg">Card {game.winning_card}</Badge>
            ) : (
              <span className="text-gray-400">Not set</span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Multiplier</CardDescription>
          </CardHeader>
          <CardContent>
            <Badge variant="outline" className="text-lg">{game.payout_multiplier}x</Badge>
          </CardContent>
        </Card>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Total Slips</CardDescription>
            <Users className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statistics.total_slips}</div>
            <div className="text-xs text-gray-500 mt-1">
              {statistics.slip_breakdown.pending} pending, {statistics.slip_breakdown.won} won, {statistics.slip_breakdown.lost} lost
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Total Wagered</CardDescription>
            <DollarSign className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(statistics.total_wagered)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Total Payout</CardDescription>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(statistics.total_payout)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Profit</CardDescription>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${statistics.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(statistics.profit)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="stats">Statistics</TabsTrigger>
          <TabsTrigger value="bets">Bets ({statistics.total_slips})</TabsTrigger>
          <TabsTrigger value="users">User Wise</TabsTrigger>
          {game.settlement_status === 'settled' && (
            <TabsTrigger value="settlement">Settlement Report</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="stats" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Card Totals</CardTitle>
              <CardDescription>Total bet amounts per card</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
                {card_totals.map((card) => (
                  <div key={card.card_number} className="text-center p-4 border rounded-lg">
                    <div className="text-2xl font-bold">Card {card.card_number}</div>
                    <div className="text-sm text-gray-600 mt-1">{formatCurrency(card.total_bet_amount)}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bets" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Bets</CardTitle>
              <CardDescription>Total: {betsTotal} bets</CardDescription>
            </CardHeader>
            <CardContent>
              {bets.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500">No bets found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Slip ID</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Total Amount</TableHead>
                        <TableHead>Payout</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Claimed</TableHead>
                        <TableHead>Bets</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bets.map((bet) => (
                        <TableRow key={bet.slip_id}>
                          <TableCell className="font-mono text-sm">{bet.slip_id}</TableCell>
                          <TableCell>
                            {bet.user ? (
                              <div>
                                <div className="font-medium">{bet.user.first_name} {bet.user.last_name}</div>
                                <div className="text-xs text-gray-500">{bet.user.user_id}</div>
                              </div>
                            ) : (
                              <span className="text-gray-400">Unknown</span>
                            )}
                          </TableCell>
                          <TableCell>{formatCurrency(bet.total_amount)}</TableCell>
                          <TableCell>
                            {bet.payout_amount > 0 ? (
                              <span className="text-green-600 font-medium">{formatCurrency(bet.payout_amount)}</span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={bet.status === 'won' ? 'default' : bet.status === 'lost' ? 'destructive' : 'outline'}>
                              {bet.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {bet.claimed ? (
                              <Badge variant="default" className="gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Yes
                              </Badge>
                            ) : (
                              <Badge variant="outline">No</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {bet.bets.map((b, idx) => (
                                <Badge key={idx} variant={b.is_winner ? 'default' : 'outline'}>
                                  Card {b.card_number}: {formatCurrency(b.bet_amount)}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Pagination */}
              {Math.ceil(betsTotal / betsLimit) > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-gray-600">
                    Page {betsPage} of {Math.ceil(betsTotal / betsLimit)}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setBetsPage((p) => Math.max(1, p - 1))}
                      disabled={betsPage === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setBetsPage((p) => p + 1)}
                      disabled={betsPage >= Math.ceil(betsTotal / betsLimit)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User Wise Summary</CardTitle>
              <CardDescription>Totals per user for this game</CardDescription>
            </CardHeader>
            <CardContent>
              {userStats.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500">No users found for this game.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead className="text-right">Total Bet</TableHead>
                        <TableHead className="text-right">Total Winning</TableHead>
                        <TableHead className="text-right">Total Claimed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {userStats.map((row, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono text-sm">{row.user.user_id}</TableCell>
                          <TableCell>
                            {(row.user.first_name || row.user.last_name)
                              ? `${row.user.first_name} ${row.user.last_name}`.trim()
                              : '—'}
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(row.totals.total_bet_amount)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.totals.total_winning_amount)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.totals.total_claimed_amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {game.settlement_status === 'settled' && (
          <TabsContent value="settlement" className="space-y-4">
            {settlementReport ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Settlement Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <div className="text-sm text-gray-500">Total Winning Slips</div>
                        <div className="text-2xl font-bold">{settlementReport.summary.total_winning_slips}</div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-500">Total Payout</div>
                        <div className="text-2xl font-bold text-red-600">{formatCurrency(settlementReport.summary.total_payout)}</div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-500">Claimed</div>
                        <div className="text-2xl font-bold">
                          {settlementReport.summary.claim_summary.claimed.count} ({formatCurrency(settlementReport.summary.claim_summary.claimed.amount)})
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-500">Unclaimed</div>
                        <div className="text-2xl font-bold">
                          {settlementReport.summary.claim_summary.unclaimed.count} ({formatCurrency(settlementReport.summary.claim_summary.unclaimed.amount)})
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Winning Slips</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Slip ID</TableHead>
                            <TableHead>User ID</TableHead>
                            <TableHead>Total Bet</TableHead>
                            <TableHead>Payout</TableHead>
                            <TableHead>Claimed</TableHead>
                            <TableHead>Winning Bets</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {settlementReport.winning_slips.map((slip) => (
                            <TableRow key={slip.slip_id}>
                              <TableCell className="font-mono text-sm">{slip.slip_id}</TableCell>
                              <TableCell>{slip.user_id}</TableCell>
                              <TableCell>{formatCurrency(slip.total_amount)}</TableCell>
                              <TableCell className="text-green-600 font-medium">{formatCurrency(slip.payout_amount)}</TableCell>
                              <TableCell>
                                {slip.claimed ? (
                                  <Badge variant="default">Yes</Badge>
                                ) : (
                                  <Badge variant="outline">No</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {slip.winning_bets.map((bet, idx) => (
                                    <Badge key={idx} variant="default">
                                      Card {bet.card_number}: {formatCurrency(bet.bet_amount)} → {formatCurrency(bet.payout_amount)}
                                    </Badge>
                                  ))}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="py-12">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
                    <p className="text-gray-500 mt-4">Loading settlement report...</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* Settle Game Dialog */}
      <Dialog open={showSettleDialog} onOpenChange={setShowSettleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Settle Game</DialogTitle>
            <DialogDescription>
              Declare the winning card for game {game.game_id}. This will calculate payouts and mark the game as settled.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Winning Card (1-12)</label>
              <Select value={winningCard.toString()} onValueChange={(v) => setWinningCard(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((card) => (
                    <SelectItem key={card} value={card.toString()}>
                      Card {card}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div className="text-sm text-yellow-800">
                  <strong>Warning:</strong> This action cannot be undone. Make sure you have verified the winning card before proceeding.
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettleDialog(false)} disabled={isSettling}>
              Cancel
            </Button>
            <Button onClick={handleSettleGame} disabled={isSettling}>
              {isSettling ? 'Settling...' : 'Confirm Settlement'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GameDetailPage;

