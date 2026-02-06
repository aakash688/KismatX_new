import React, { useState, useEffect, useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminService, User, statsService, StatsResponse, UserStatsData } from "@/services/services";
import { BarChart3, Calendar, TrendingUp, Users } from "lucide-react";

interface StatsData {
  totalWagered: number;
  totalScanned: number;
  margin: number;
  netToPay: number;
}

interface UserStats {
  user: User;
  wagered: number;
  scanned: number;
  margin: number;
  netToPay: number;
}

const StatsPage: React.FC = () => {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [userStats, setUserStats] = useState<UserStats[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [userSearchTerm, setUserSearchTerm] = useState<string>("");
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Initialize users and today's date
  useEffect(() => {
    fetchUsers();

    const today = new Date().toISOString().split("T")[0];
    setStartDate(today);
    setEndDate(today);
    setSelectedUser("all");
    setUserSearchTerm("All Users");
  }, []);

  // Fetch stats whenever filter changes (only if dates are set)
  useEffect(() => {
    if (startDate && endDate) {
      fetchStats();
    }
  }, [selectedUser, startDate, endDate]);

  const fetchUsers = async () => {
    try {
      const response = await adminService.getUsers({ limit: 1000 });
      const playersOnly = (response.users || []).filter((u) => u.user_type === "player");
      setUsers(playersOnly);
    } catch (err) {
      console.error("Failed to load users:", err);
    }
  };

  const fetchStats = async () => {
    try {
      setIsLoading(true);

      // Call real API with date range and user filter
      const response = await statsService.getStats(startDate, endDate, selectedUser);

      console.log("📊 Stats response:", response);

      // Set summary stats
      setStats(response.summary);

      // Set user stats
      setUserStats(response.userStats || []);
    } catch (err: any) {
      console.error("❌ Failed to load stats:", err);
      setError(err.response?.data?.message || err.message || "Failed to load statistics");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateReport = () => fetchStats();

  const formatPoints = (points: number) => points.toLocaleString("en-IN");

  // Handle click outside for dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowUserDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Statistics</h1>
        <p className="text-gray-600">View detailed statistics and analytics</p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Select filters to view data</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Start Date</label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-10" />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">End Date</label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-10" />
            </div>

            <div ref={dropdownRef} className="relative">
              <label className="text-sm font-medium mb-2 block">User</label>
              <Input
                type="text"
                placeholder="Search or select user..."
                value={userSearchTerm}
                onFocus={() => setShowUserDropdown(true)}
                onChange={e => {
                  setUserSearchTerm(e.target.value);
                  setShowUserDropdown(true);
                }}
                className="h-10"
              />
              {showUserDropdown && (
                <div className="absolute z-10 mt-1 w-full bg-white border rounded-md shadow-lg max-h-56 overflow-y-auto">
                  <div
                    className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm font-medium"
                    onClick={() => {
                      setSelectedUser("all");
                      setUserSearchTerm("All Users");
                      setShowUserDropdown(false);
                    }}
                  >
                    All Users
                  </div>

                  {users
                    .filter(u => {
                      const search = userSearchTerm.toLowerCase();
                      const fullName = `${u.first_name} ${u.last_name}`.toLowerCase();
                      const userId = u.user_id?.toLowerCase() || "";
                      return fullName.includes(search) || userId.includes(search);
                    })
                    .slice(0, 20)
                    .map(u => (
                      <div
                        key={u.id}
                        className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                        onClick={() => {
                          setSelectedUser(u.id.toString());
                          setUserSearchTerm(`${u.first_name} ${u.last_name} (${u.user_id})`);
                          setShowUserDropdown(false);
                        }}
                      >
                        {u.first_name} {u.last_name} ({u.user_id})
                      </div>
                    ))}

                  {users.filter(u => {
                    const search = userSearchTerm.toLowerCase();
                    const fullName = `${u.first_name} ${u.last_name}`.toLowerCase();
                    const userId = u.user_id?.toLowerCase() || "";
                    return fullName.includes(search) || userId.includes(search);
                  }).length === 0 && (
                    <div className="px-3 py-2 text-gray-500 text-sm">No users found</div>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col justify-end">
              <Button onClick={handleGenerateReport} disabled={isLoading} className="w-full h-10">
                {isLoading ? "Loading..." : "Search"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { title: "Total Wagered", value: stats.totalWagered, icon: <TrendingUp className="h-4 w-4" />, color: "text-blue-600" },
            { title: "Total Scanned", value: stats.totalScanned, icon: <Calendar className="h-4 w-4" />, color: "text-red-600" },
            { title: "Margin", value: stats.margin, icon: <BarChart3 className="h-4 w-4" />, color: "text-yellow-600" },
            { title: "Net To Pay", value: stats.netToPay, icon: <Users className="h-4 w-4" />, color: stats.netToPay >= 0 ? "text-green-600" : "text-red-600" },
          ].map((item, idx) => (
            <Card key={idx}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{item.title}</CardTitle>
                {item.icon}
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${item.color}`}>{formatPoints(item.value)} pts</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* User Stats Table */}
      <Card>
        <CardHeader>
          <CardTitle>Users Stats</CardTitle>
          <CardDescription>Detailed stats per user</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Wagered</TableHead>
                <TableHead>Scanned</TableHead>
                <TableHead>Margin</TableHead>
                <TableHead>Net To Pay</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {userStats.length ? (
                userStats.map(u => (
                  <TableRow key={u.user.id}>
                    <TableCell>{u.user.first_name} {u.user.last_name} ({u.user.user_id})</TableCell>
                    <TableCell>{formatPoints(u.wagered)}</TableCell>
                    <TableCell>{formatPoints(u.scanned)}</TableCell>
                    <TableCell>{formatPoints(u.margin)}</TableCell>
                    <TableCell className={u.netToPay >= 0 ? "text-green-600" : "text-red-600"}>{formatPoints(u.netToPay)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-gray-500">
                    No data available
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default StatsPage;
