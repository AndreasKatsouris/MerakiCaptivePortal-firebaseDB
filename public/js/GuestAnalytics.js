import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, TrendingUp, Calendar, Store } from 'lucide-react';
import _ from 'lodash';

const GuestAnalytics = ({ phoneNumber }) => {
  const [metrics, setMetrics] = useState(null);
  const [spendingHistory, setSpendingHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadGuestAnalytics = async () => {
      try {
        setLoading(true);
        const guestMetrics = await calculateGuestMetrics(phoneNumber);
        setMetrics(guestMetrics);
        
        const history = await loadSpendingHistory(phoneNumber);
        setSpendingHistory(history);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (phoneNumber) {
      loadGuestAnalytics();
    }
  }, [phoneNumber]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-500 p-4">
        Error loading analytics: {error}
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="p-2 bg-blue-100 rounded-full">
                <TrendingUp className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Spend</p>
                <h3 className="text-2xl font-bold">R{metrics.totalSpend.toFixed(2)}</h3>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="p-2 bg-green-100 rounded-full">
                <Activity className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avg Transaction</p>
                <h3 className="text-2xl font-bold">R{metrics.averageTransaction.toFixed(2)}</h3>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="p-2 bg-purple-100 rounded-full">
                <Calendar className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Visit Frequency</p>
                <h3 className="text-2xl font-bold">{metrics.visitFrequency} days</h3>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="p-2 bg-orange-100 rounded-full">
                <Store className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Favorite Store</p>
                <h3 className="text-lg font-bold truncate">{metrics.favoriteStore}</h3>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Spending Trends */}
      <Card>
        <CardHeader>
          <CardTitle>Spending History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={spendingHistory}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line 
                  type="monotone" 
                  dataKey="amount" 
                  stroke="#2563eb" 
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Store Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Store Preferences</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {metrics.storePreferences.map((store, index) => (
              <div key={index} className="flex items-center justify-between">
                <span className="font-medium">{store.name}</span>
                <div className="flex items-center space-x-4">
                  <span className="text-sm text-muted-foreground">
                    {store.visits} visits
                  </span>
                  <div className="w-32 h-2 bg-gray-200 rounded-full">
                    <div 
                      className="h-full bg-blue-600 rounded-full" 
                      style={{ width: `${store.percentage}%` }}
                    ></div>
                  </div>
                  <span className="text-sm font-medium">{store.percentage}%</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Engagement Score */}
      <Card>
        <CardHeader>
          <CardTitle>Engagement Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4">
              <p className="text-sm font-medium text-muted-foreground">Engagement Score</p>
              <h3 className="text-3xl font-bold text-blue-600">{metrics.engagementScore}</h3>
            </div>
            <div className="text-center p-4">
              <p className="text-sm font-medium text-muted-foreground">Receipts Submitted</p>
              <h3 className="text-3xl font-bold text-green-600">{metrics.totalReceipts}</h3>
            </div>
            <div className="text-center p-4">
              <p className="text-sm font-medium text-muted-foreground">Days Since Last Visit</p>
              <h3 className="text-3xl font-bold text-purple-600">{metrics.daysSinceLastVisit}</h3>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

async function calculateGuestMetrics(phoneNumber) {
  try {
    // Fetch guest receipts
    const receiptsSnapshot = await window.firebase.database()
      .ref('guest-receipts')
      .child(phoneNumber)
      .once('value');
    
    const receiptIds = Object.keys(receiptsSnapshot.val() || {});
    
    // Fetch full receipt details
    const receiptsData = await Promise.all(
      receiptIds.map(async id => {
        const snapshot = await window.firebase.database()
          .ref('receipts')
          .child(id)
          .once('value');
        return { id, ...snapshot.val() };
      })
    );

    // Calculate total spend and average transaction
    const totalSpend = _.sumBy(receiptsData, 'totalAmount');
    const averageTransaction = totalSpend / receiptsData.length;

    // Calculate visit frequency (average days between visits)
    const dates = receiptsData.map(r => new Date(r.processedAt)).sort();
    const visitFrequency = dates.length > 1 
      ? Math.round((dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24 * (dates.length - 1)))
      : 0;

    // Calculate store preferences
    const storeVisits = _.countBy(receiptsData, 'storeName');
    const totalVisits = receiptsData.length;
    const storePreferences = Object.entries(storeVisits)
      .map(([name, visits]) => ({
        name,
        visits,
        percentage: Math.round((visits / totalVisits) * 100)
      }))
      .sort((a, b) => b.visits - a.visits);

    const favoriteStore = storePreferences[0]?.name || 'N/A';

    // Calculate days since last visit
    const lastVisit = new Date(Math.max(...dates));
    const daysSinceLastVisit = Math.round((new Date() - lastVisit) / (1000 * 60 * 60 * 24));

    // Calculate engagement score (0-100)
    const recencyScore = Math.max(0, 100 - (daysSinceLastVisit * 2));
    const frequencyScore = Math.min(100, visitFrequency ? (30 / visitFrequency) * 100 : 0);
    const monetaryScore = Math.min(100, (totalSpend / 10000) * 100);
    
    const engagementScore = Math.round(
      (recencyScore * 0.4) + (frequencyScore * 0.3) + (monetaryScore * 0.3)
    );

    return {
      totalSpend,
      averageTransaction,
      visitFrequency,
      favoriteStore,
      storePreferences,
      totalReceipts: receiptsData.length,
      daysSinceLastVisit,
      engagementScore
    };
  } catch (error) {
    console.error('Error calculating guest metrics:', error);
    throw new Error('Failed to calculate guest metrics');
  }
}

async function loadSpendingHistory(phoneNumber) {
  try {
    const receiptsSnapshot = await window.firebase.database()
      .ref('guest-receipts')
      .child(phoneNumber)
      .once('value');
    
    const receiptIds = Object.keys(receiptsSnapshot.val() || {});
    
    const receiptsData = await Promise.all(
      receiptIds.map(async id => {
        const snapshot = await window.firebase.database()
          .ref('receipts')
          .child(id)
          .once('value');
        return { id, ...snapshot.val() };
      })
    );

    return receiptsData
      .map(receipt => ({
        date: new Date(receipt.processedAt).toLocaleDateString(),
        amount: receipt.totalAmount
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  } catch (error) {
    console.error('Error loading spending history:', error);
    throw new Error('Failed to load spending history');
  }
}

// Make the component globally available
export { 
    GuestAnalytics
 };