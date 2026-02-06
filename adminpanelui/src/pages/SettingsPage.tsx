import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { settingsService, GameSettings, SettingsLog } from '@/services/services';
import { Settings, Save, RefreshCw, Clock, DollarSign, Zap, ToggleLeft, History, ArrowRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<GameSettings>({
    game_multiplier: '10',
    maximum_limit: '5000',
    game_start_time: '08:00',
    game_end_time: '22:00',
    game_result_type: 'manual'
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Settings Logs state
  const [settingsLogs, setSettingsLogs] = useState<SettingsLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const [settingKeyFilter, setSettingKeyFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('created_at');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');
  const limit = 20;

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setIsLoading(true);
      setError('');
      const response = await settingsService.getSettings();
      setSettings(response.settings);
    } catch (err: any) {
      console.error('Failed to fetch settings:', err);
      setError(err.response?.data?.message || 'Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setIsSaving(true);
      setError('');
      setSuccess('');

      const response = await settingsService.updateSettings(settings);
      
      setSuccess('Settings saved successfully!');
      setTimeout(() => setSuccess(''), 5000);
      // Refresh logs after saving
      if (activeTab === 'logs') {
        fetchSettingsLogs();
      }
    } catch (err: any) {
      console.error('Failed to update settings:', err);
      setError(err.response?.data?.message || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (field: keyof GameSettings, value: string) => {
    setSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const [activeTab, setActiveTab] = useState('settings');

  const fetchSettingsLogs = async () => {
    try {
      setIsLoadingLogs(true);
      const params: any = {
        page: currentPage,
        limit,
        sort_by: sortBy,
        sort_order: sortOrder,
      };
      
      if (settingKeyFilter !== 'all') {
        params.setting_key = settingKeyFilter;
      }

      const response = await settingsService.getSettingsLogs(params);
      setSettingsLogs(response.logs || []);
      setTotalLogs(response.pagination?.total || 0);
    } catch (err: any) {
      console.error('Failed to fetch settings logs:', err);
      setError(err.response?.data?.message || 'Failed to load settings logs');
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'logs') {
      fetchSettingsLogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, currentPage, settingKeyFilter, sortBy, sortOrder]);

  const getSettingKeyLabel = (key: string) => {
    const labels: Record<string, string> = {
      game_multiplier: 'Game Multiplier',
      maximum_limit: 'Maximum Limit',
      game_start_time: 'Game Start Time',
      game_end_time: 'Game End Time',
      game_result_type: 'Game Result Type'
    };
    return labels[key] || key;
  };

  const totalPages = Math.ceil(totalLogs / limit);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600">Configure game parameters and system settings</p>
        </div>
        {activeTab === 'settings' && (
          <Button variant="outline" onClick={fetchSettings} disabled={isLoading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        )}
        {activeTab === 'logs' && (
          <Button variant="outline" onClick={fetchSettingsLogs} disabled={isLoadingLogs}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        )}
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
          {success}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="settings">
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="logs">
            <History className="mr-2 h-4 w-4" />
            Change History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings">
          {/* Settings Form */}
          <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Settings className="h-5 w-5" />
              <span>Game Configuration</span>
            </CardTitle>
            <CardDescription>
              Configure game multipliers, limits, timing, and result generation settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Game Multiplier */}
            <div className="space-y-2">
              <Label htmlFor="game_multiplier" className="flex items-center space-x-2">
                <Zap className="h-4 w-4 text-yellow-600" />
                <span>Game Multiplier</span>
              </Label>
              <Input
                id="game_multiplier"
                type="number"
                step="0.1"
                min="0.1"
                value={settings.game_multiplier}
                onChange={(e) => handleChange('game_multiplier', e.target.value)}
                placeholder="1.5"
                required
              />
              <p className="text-sm text-gray-500">
                The multiplier for winnings or scoring. Example: 1.5, 2, etc.
              </p>
            </div>

            {/* Maximum Limit */}
            <div className="space-y-2">
              <Label htmlFor="maximum_limit" className="flex items-center space-x-2">
                <DollarSign className="h-4 w-4 text-green-600" />
                <span>Maximum Limit</span>
              </Label>
              <Input
                id="maximum_limit"
                type="number"
                step="1"
                min="0"
                value={settings.maximum_limit}
                onChange={(e) => handleChange('maximum_limit', e.target.value)}
                placeholder="1000"
                required
              />
              <p className="text-sm text-gray-500">
                Maximum bet, stake, or points allowed per game. Example: ₹1000 or 100 points.
              </p>
            </div>

            {/* Game Start Time */}
            <div className="space-y-2">
              <Label htmlFor="game_start_time" className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-blue-600" />
                <span>Game Start Time</span>
              </Label>
              <Input
                id="game_start_time"
                type="time"
                value={settings.game_start_time}
                onChange={(e) => handleChange('game_start_time', e.target.value)}
                required
              />
              <p className="text-sm text-gray-500">
                When the game opens. Format: HH:MM (e.g., 09:00)
              </p>
            </div>

            {/* Game End Time */}
            <div className="space-y-2">
              <Label htmlFor="game_end_time" className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-red-600" />
                <span>Game End Time</span>
              </Label>
              <Input
                id="game_end_time"
                type="time"
                value={settings.game_end_time}
                onChange={(e) => handleChange('game_end_time', e.target.value)}
                required
              />
              <p className="text-sm text-gray-500">
                When the game closes. Format: HH:MM (e.g., 23:00)
              </p>
            </div>

            {/* Game Result Type */}
            <div className="space-y-2">
              <Label htmlFor="game_result_type" className="flex items-center space-x-2">
                <ToggleLeft className="h-4 w-4 text-purple-600" />
                <span>Game Result Type</span>
              </Label>
              <Select
                value={settings.game_result_type}
                onValueChange={(value: 'auto' | 'manual') => handleChange('game_result_type', value)}
              >
                <SelectTrigger id="game_result_type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto-generated</SelectItem>
                  <SelectItem value="manual">Manually Set</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-gray-500">
                Choose whether game results are auto-generated by the system or manually set by administrators.
              </p>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end pt-4 border-t">
              <Button type="submit" disabled={isSaving} className="min-w-[120px]">
                {isSaving ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Settings
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
        </TabsContent>

        <TabsContent value="logs">
          {/* Settings Logs */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <History className="h-5 w-5" />
                <span>Settings Change History</span>
              </CardTitle>
              <CardDescription>
                View all changes made to game settings with before/after values
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Filters and Sorting */}
              <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <Select value={settingKeyFilter} onValueChange={(value) => { setSettingKeyFilter(value); setCurrentPage(1); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by Setting" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Settings</SelectItem>
                    <SelectItem value="game_multiplier">Game Multiplier</SelectItem>
                    <SelectItem value="maximum_limit">Maximum Limit</SelectItem>
                    <SelectItem value="game_start_time">Game Start Time</SelectItem>
                    <SelectItem value="game_end_time">Game End Time</SelectItem>
                    <SelectItem value="game_result_type">Game Result Type</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortBy} onValueChange={(value) => { setSortBy(value); setCurrentPage(1); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="created_at">Date</SelectItem>
                    <SelectItem value="setting_key">Setting Name</SelectItem>
                    <SelectItem value="admin_id">Admin</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortOrder} onValueChange={(value: 'ASC' | 'DESC') => { setSortOrder(value); setCurrentPage(1); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Order" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DESC">
                      <div className="flex items-center space-x-2">
                        <ArrowDown className="h-4 w-4" />
                        <span>Descending</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="ASC">
                      <div className="flex items-center space-x-2">
                        <ArrowUp className="h-4 w-4" />
                        <span>Ascending</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Logs Table */}
              {isLoadingLogs ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ID</TableHead>
                          <TableHead>
                            <button
                              onClick={() => {
                                if (sortBy === 'setting_key') {
                                  setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
                                } else {
                                  setSortBy('setting_key');
                                  setSortOrder('ASC');
                                }
                                setCurrentPage(1);
                              }}
                              className="flex items-center space-x-1 hover:text-gray-900"
                            >
                              <span>Setting</span>
                              {sortBy === 'setting_key' ? (
                                sortOrder === 'ASC' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                              ) : (
                                <ArrowUpDown className="h-3 w-3 text-gray-400" />
                              )}
                            </button>
                          </TableHead>
                          <TableHead>Previous Value</TableHead>
                          <TableHead>New Value</TableHead>
                          <TableHead>
                            <button
                              onClick={() => {
                                if (sortBy === 'admin_id') {
                                  setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
                                } else {
                                  setSortBy('admin_id');
                                  setSortOrder('ASC');
                                }
                                setCurrentPage(1);
                              }}
                              className="flex items-center space-x-1 hover:text-gray-900"
                            >
                              <span>Changed By</span>
                              {sortBy === 'admin_id' ? (
                                sortOrder === 'ASC' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                              ) : (
                                <ArrowUpDown className="h-3 w-3 text-gray-400" />
                              )}
                            </button>
                          </TableHead>
                          <TableHead>
                            <button
                              onClick={() => {
                                if (sortBy === 'created_at') {
                                  setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
                                } else {
                                  setSortBy('created_at');
                                  setSortOrder('DESC');
                                }
                                setCurrentPage(1);
                              }}
                              className="flex items-center space-x-1 hover:text-gray-900"
                            >
                              <span>Date</span>
                              {sortBy === 'created_at' ? (
                                sortOrder === 'ASC' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                              ) : (
                                <ArrowUpDown className="h-3 w-3 text-gray-400" />
                              )}
                            </button>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {settingsLogs.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                              No settings changes found
                            </TableCell>
                          </TableRow>
                        ) : (
                          settingsLogs.map((log) => (
                            <TableRow key={log.id}>
                              <TableCell className="font-medium">{log.id}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{getSettingKeyLabel(log.setting_key)}</Badge>
                              </TableCell>
                              <TableCell className="text-sm">
                                {log.previous_value !== null ? (
                                  <span className="text-gray-600">{log.previous_value}</span>
                                ) : (
                                  <span className="text-gray-400 italic">(New)</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center space-x-2">
                                  <ArrowRight className="h-4 w-4 text-blue-600" />
                                  <span className="font-medium text-green-600">{log.new_value}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm">
                                  <div className="font-medium">{log.admin_name || log.admin_user_id || 'Unknown'}</div>
                                  {log.ip_address && (
                                    <div className="text-gray-500 text-xs">{log.ip_address}</div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-gray-500">
                                {new Date(log.created_at).toLocaleString()}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  {totalLogs > 0 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <div className="text-sm text-gray-700">
                        Showing {((currentPage - 1) * limit) + 1} to {Math.min(currentPage * limit, totalLogs)} of {totalLogs} changes
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                          disabled={currentPage === 1}
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
                          disabled={currentPage >= totalPages}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SettingsPage;

