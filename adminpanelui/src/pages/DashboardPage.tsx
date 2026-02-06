import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { adminService, DashboardStats } from '@/services/services';
import { Users, UserCheck, UserX, DollarSign, Clock, Shield } from 'lucide-react';

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await adminService.getDashboard();
        setStats(data);
      } catch (err: any) {
        setError(err.response?.data?.message || err.message || 'Failed to load dashboard data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, []);

  const handleStatClick = (statType: string) => {
    switch (statType) {
      case 'totalUsers':
        navigate('/users');
        break;
      case 'activeUsers':
        navigate('/users?status=active');
        break;
      case 'bannedUsers':
        navigate('/users?status=banned');
        break;
      case 'totalDeposits':
        navigate('/deposits');
        break;
      case 'recentLogins':
        navigate('/logins');
        break;
      case 'adminActions':
        navigate('/audit-logs');
        break;
      default:
        break;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  const statCards = [
    {
      title: 'Total Users',
      value: stats?.totalUsers || 0,
      icon: Users,
      description: 'All registered users',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      statType: 'totalUsers',
    },
    {
      title: 'Active Users',
      value: stats?.activeUsers || 0,
      icon: UserCheck,
      description: 'Currently active users',
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      statType: 'activeUsers',
    },
    {
      title: 'Banned Users',
      value: stats?.bannedUsers || 0,
      icon: UserX,
      description: 'Users with banned status',
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      statType: 'bannedUsers',
    },
    {
      title: 'Wallet Balance',
      value: `₹${stats?.totalDeposits?.toLocaleString() || 0}`,
      icon: DollarSign,
      description: 'Total wallet balance',
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      statType: 'totalDeposits',
    },
    {
      title: 'Recent Logins',
      value: stats?.recentLogins || 0,
      icon: Clock,
      description: 'Logins in last 24 hours',
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      statType: 'recentLogins',
    },
    {
      title: 'Admin Actions',
      value: stats?.adminActions || 0,
      icon: Shield,
      description: 'Admin actions today',
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      statType: 'adminActions',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">Welcome to the KismatX Admin Panel</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card 
              key={index} 
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => handleStatClick(stat.statType)}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <div className={`p-2 rounded-full ${stat.bgColor}`}>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>
              Common administrative tasks
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
              <div className="flex items-center space-x-3">
                <Users className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="font-medium">Manage Users</p>
                  <p className="text-sm text-gray-500">View and edit user accounts</p>
                </div>
              </div>
              <Badge variant="outline">View</Badge>
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
              <div className="flex items-center space-x-3">
                <Shield className="h-5 w-5 text-purple-600" />
                <div>
                  <p className="font-medium">Role Management</p>
                  <p className="text-sm text-gray-500">Configure user roles and permissions</p>
                </div>
              </div>
              <Badge variant="outline">View</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System Status</CardTitle>
            <CardDescription>
              Current system health and status
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">API Status</span>
              <Badge variant="success">Online</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Database</span>
              <Badge variant="success">Connected</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Authentication</span>
              <Badge variant="success">Active</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DashboardPage;
