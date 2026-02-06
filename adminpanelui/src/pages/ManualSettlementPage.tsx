import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { gameService, SettlementDecisionData, CardAnalysis, settingsService } from '@/services/services';
import { ArrowLeft, Trophy, TrendingUp, TrendingDown, DollarSign, Users, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';

const ManualSettlementPage: React.FC = () => {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<SettlementDecisionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCard, setSelectedCard] = useState<number | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [gameResultType, setGameResultType] = useState<'auto' | 'manual'>('manual');

  useEffect(() => {
    if (gameId) {
      fetchData();
      fetchSettings();
    }
  }, [gameId]);

  const fetchSettings = async () => {
    try {
      const response = await settingsService.getSettings();
      setGameResultType(response.settings.game_result_type || 'manual');
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    }
  };

  useEffect(() => {
    if (autoRefresh && gameId && data?.game.status === 'completed' && data.game.settlement_status === 'not_settled') {
      const interval = setInterval(() => {
        fetchData();
      }, 5000); // Refresh every 5 seconds

      return () => clearInterval(interval);
    }
  }, [autoRefresh, gameId, data?.game.status, data?.game.settlement_status]);

  const fetchData = async () => {
    if (!gameId) return;

    try {
      setIsLoading(true);
      setError('');
      const response = await gameService.getSettlementDecisionData(gameId);
      setData(response);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load settlement data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSettleGame = async () => {
    if (!gameId || !selectedCard) return;

    try {
      setIsSettling(true);
      await gameService.settleGame(gameId, { winning_card: selectedCard });
      setShowConfirmDialog(false);
      // Refresh data
      await fetchData();
      // Navigate back to game detail
      navigate(`/games/${gameId}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to settle game');
      setShowConfirmDialog(false);
    } finally {
      setIsSettling(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const getProfitColor = (profit: number) => {
    if (profit > 0) return 'text-green-600';
    if (profit < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  const getProfitBadgeVariant = (profit: number): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (profit > 0) return 'default';
    if (profit < 0) return 'destructive';
    return 'outline';
  };

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">{error}</p>
        <Button onClick={() => navigate('/games')} className="mt-4" variant="outline">
          Back to Games
        </Button>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const canSettle = data.game.status === 'completed' && data.game.settlement_status === 'not_settled';
  const selectedCardData = selectedCard ? data.card_analysis.find(c => c.card_number === selectedCard) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate(`/games/${gameId}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Game Details
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Manual Game Settlement</h1>
            <p className="text-gray-600 mt-1">
              Game: {data.game.game_id} | {new Date(data.game.start_time).toLocaleString()} - {new Date(data.game.end_time).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAutoRefresh(!autoRefresh);
              if (!autoRefresh) fetchData();
            }}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
            {autoRefresh ? 'Auto Refresh ON' : 'Auto Refresh OFF'}
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {gameResultType === 'auto' && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-blue-800">
              <AlertCircle className="h-5 w-5" />
              <p>
                <strong>Auto Mode Enabled:</strong> Games are automatically settled. This page allows you to manually override and preview settlement options.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!canSettle && (
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-yellow-800">
              <AlertCircle className="h-5 w-5" />
              <p>
                {data.game.status !== 'completed'
                  ? `Game is ${data.game.status}. Wait for game to complete.`
                  : `Game is already ${data.game.settlement_status}. Cannot settle again.`}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Wagered</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.summary.total_wagered)}</div>
            <p className="text-xs text-gray-500 mt-1">Total betting amount received</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Bet Slips</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary.total_slips}</div>
            <p className="text-xs text-gray-500 mt-1">Number of bet slips placed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Individual Bets</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary.total_bets}</div>
            <p className="text-xs text-gray-500 mt-1">Number of card bets placed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Payout Multiplier</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.game.payout_multiplier}x</div>
            <p className="text-xs text-gray-500 mt-1">Winning bet multiplier</p>
          </CardContent>
        </Card>
      </div>

      {/* Card Analysis Table */}
      <Card>
        <CardHeader>
          <CardTitle>Card Analysis & Profit/Loss Projections</CardTitle>
          <CardDescription>
            Select a winning card to see payout calculations. Cards are sorted by profit (most profitable first).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Card</TableHead>
                  <TableHead className="text-right">Total Bet</TableHead>
                  <TableHead className="text-right">Total Payout</TableHead>
                  <TableHead className="text-right">Profit/Loss</TableHead>
                  <TableHead className="text-right">Profit %</TableHead>
                  <TableHead className="text-right">Winning Slips</TableHead>
                  <TableHead className="text-right">Losing Slips</TableHead>
                  <TableHead className="text-right">Bets Count</TableHead>
                  <TableHead className="text-center">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.card_analysis.map((card) => (
                  <TableRow
                    key={card.card_number}
                    className={`${
                      selectedCard === card.card_number ? 'bg-blue-50' : ''
                    } ${!canSettle ? 'opacity-60' : ''}`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
                          {card.card_number}
                        </div>
                        {selectedCard === card.card_number && (
                          <CheckCircle2 className="h-5 w-5 text-blue-600" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(card.total_bet_amount)}</TableCell>
                    <TableCell className="text-right font-medium text-blue-600">
                      {formatCurrency(card.total_payout)}
                    </TableCell>
                    <TableCell className={`text-right font-bold ${getProfitColor(card.profit)}`}>
                      <div className="flex items-center justify-end gap-1">
                        {card.profit > 0 ? (
                          <TrendingUp className="h-4 w-4" />
                        ) : card.profit < 0 ? (
                          <TrendingDown className="h-4 w-4" />
                        ) : null}
                        {formatCurrency(card.profit)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={getProfitBadgeVariant(card.profit)}>
                        {card.profit_percentage > 0 ? '+' : ''}
                        {card.profit_percentage.toFixed(2)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="default">{card.winning_slips_count}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">{card.losing_slips_count}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-gray-600">{card.bets_count}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant={selectedCard === card.card_number ? 'default' : 'outline'}
                        onClick={() => {
                          if (canSettle) {
                            setSelectedCard(card.card_number);
                          }
                        }}
                        disabled={!canSettle}
                        className="w-full"
                      >
                        {selectedCard === card.card_number ? 'Selected' : 'Select'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Selected Card Summary */}
          {selectedCard && selectedCardData && (
            <Card className="mt-6 bg-blue-50 border-blue-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-blue-600" />
                  Selected Card: {selectedCard}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <div className="text-sm text-gray-600">Total Bet on Card</div>
                    <div className="text-xl font-bold">{formatCurrency(selectedCardData.total_bet_amount)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Total Payout Required</div>
                    <div className="text-xl font-bold text-blue-600">{formatCurrency(selectedCardData.total_payout)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Profit/Loss</div>
                    <div className={`text-xl font-bold ${getProfitColor(selectedCardData.profit)}`}>
                      {selectedCardData.profit > 0 ? (
                        <span className="flex items-center gap-1">
                          <TrendingUp className="h-5 w-5" />
                          {formatCurrency(selectedCardData.profit)}
                        </span>
                      ) : selectedCardData.profit < 0 ? (
                        <span className="flex items-center gap-1">
                          <TrendingDown className="h-5 w-5" />
                          {formatCurrency(selectedCardData.profit)}
                        </span>
                      ) : (
                        formatCurrency(0)
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Winning Slips</div>
                    <div className="text-xl font-bold">{selectedCardData.winning_slips_count}</div>
                    <div className="text-xs text-gray-500">{selectedCardData.losing_slips_count} losing</div>
                  </div>
                </div>
                {!canSettle && (
                  <div className="mt-4 p-3 bg-yellow-100 border border-yellow-300 rounded-md">
                    <p className="text-sm text-yellow-800">
                      {data.game.status !== 'completed'
                        ? `Game is ${data.game.status}. Cannot settle until game is completed.`
                        : `Game is already ${data.game.settlement_status}. Cannot settle again.`}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      {/* Fixed Submit Button - Always visible when card is selected */}
      {selectedCard && selectedCardData && (
        <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 shadow-lg rounded-t-lg">
          <Card className="border-0 shadow-none">
            <CardContent className="p-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-6 w-6 text-blue-600" />
                    <div>
                      <div className="text-sm text-gray-600">Selected Winning Card</div>
                      <div className="text-2xl font-bold">Card {selectedCard}</div>
                    </div>
                  </div>
                  <div className="h-12 w-px bg-gray-300"></div>
                  <div>
                    <div className="text-sm text-gray-600">Profit/Loss</div>
                    <div className={`text-xl font-bold ${getProfitColor(selectedCardData.profit)}`}>
                      {formatCurrency(selectedCardData.profit)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Total Payout</div>
                    <div className="text-xl font-bold text-blue-600">
                      {formatCurrency(selectedCardData.total_payout)}
                    </div>
                  </div>
                </div>
                <Button
                  onClick={() => setShowConfirmDialog(true)}
                  size="lg"
                  disabled={!canSettle || isSettling}
                  className="min-w-[200px]"
                >
                  {isSettling ? (
                    <>
                      <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                      Settling...
                    </>
                  ) : (
                    <>
                      <Trophy className="h-5 w-5 mr-2" />
                      Settle Game with Card {selectedCard}
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Settlement</DialogTitle>
            <DialogDescription>
              Are you sure you want to settle this game with Card {selectedCard} as the winning card?
            </DialogDescription>
          </DialogHeader>
          {selectedCardData && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-600">Total Wagered:</div>
                  <div className="font-bold">{formatCurrency(data.summary.total_wagered)}</div>
                </div>
                <div>
                  <div className="text-gray-600">Total Payout:</div>
                  <div className="font-bold text-blue-600">{formatCurrency(selectedCardData.total_payout)}</div>
                </div>
                <div>
                  <div className="text-gray-600">Profit/Loss:</div>
                  <div className={`font-bold ${getProfitColor(selectedCardData.profit)}`}>
                    {formatCurrency(selectedCardData.profit)}
                  </div>
                </div>
                <div>
                  <div className="text-gray-600">Winning Slips:</div>
                  <div className="font-bold">{selectedCardData.winning_slips_count}</div>
                </div>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                <p className="text-sm text-yellow-800">
                  <strong>Warning:</strong> This action cannot be undone. Once settled, the winning card cannot be changed.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)} disabled={isSettling}>
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

export default ManualSettlementPage;

