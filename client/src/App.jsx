import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { 
  LineChart, 
  Line, 
  ResponsiveContainer, 
  YAxis, 
  Tooltip, 
  XAxis 
} from 'recharts';
import { Activity, Shield, Wifi, Globe, Plus, AlertCircle, Download, TrendingUp } from 'lucide-react';

const SOCKET_URL = 'http://localhost:5000';

function App() {
  const [targets, setTargets] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef();

  useEffect(() => {
    socketRef.current = io(SOCKET_URL);

    socketRef.current.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to server');
    });

    socketRef.current.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from server');
    });

    socketRef.current.on('initial-data', (data) => {
      setTargets(data);
    });

    socketRef.current.on('ping-update', (update) => {
      setTargets(prev => prev.map(t => {
        if (t.id === update.targetId) {
          const newHistory = [...t.history, update].slice(-50);
          return { ...t, history: newHistory, lastPing: update };
        }
        return t;
      }));
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, []);

  const handleDownload = () => {
    window.open(`${SOCKET_URL}/api/report`, '_blank');
  };

  const handleDownloadPDF = () => {
    window.open(`${SOCKET_URL}/api/report-pdf`, '_blank');
  };

  const handleDownloadGraph = () => {
    window.open(`${SOCKET_URL}/api/report-graph`, '_blank');
  };

  return (
    <div className="dashboard">
      <header>
        <div className="header-title">
          <h1>Network Monitor</h1>
          <p>Real-time latency tracking & node health</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button 
            onClick={handleDownload}
            className="download-btn csv"
          >
            <Download size={18} />
            CSV
          </button>
          <button 
            onClick={handleDownloadPDF}
            className="download-btn pdf"
          >
            <Download size={18} />
            PDF
          </button>
          <button 
            onClick={handleDownloadGraph}
            className="download-btn graph"
          >
            <TrendingUp size={18} />
            Analytics
          </button>
          <div className="status-badge">
            <div className={isConnected ? "pulse" : "pulse"} style={{ backgroundColor: isConnected ? '#10b981' : '#ef4444' }}></div>
            <span>Server: {isConnected ? 'Live' : 'Offline'}</span>
          </div>
        </div>
      </header>

      <div className="grid">
        {targets.map(target => (
          <MonitorCard key={target.id} target={target} />
        ))}
        
        <div className="monitor-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', cursor: 'pointer' }}>
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
            <Plus size={32} style={{ marginBottom: '0.5rem' }} />
            <p>Add Target</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MonitorCard({ target }) {
  const lastPing = target.lastPing || (target.history.length > 0 ? target.history[target.history.length - 1] : null);
  const latency = lastPing ? lastPing.time : 0;
  const isAlive = lastPing ? lastPing.alive : false;
  
  const statusClass = !isAlive ? 'status-offline' : (latency > 150 ? 'status-slow' : 'status-online');
  const statusText = !isAlive ? 'Offline' : (latency > 150 ? 'Slow' : 'Operational');

  return (
    <div className="monitor-card">
      <div className="card-header">
        <div className="card-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            {target.ip.includes('8.8.8.8') ? <Globe size={18} color="#3b82f6" /> : <Shield size={18} color="#3b82f6" />}
            <h2>{target.label}</h2>
          </div>
          <span>{target.ip}</span>
        </div>
        <div className="latency-display">
          <div className="latency-value" style={{ color: !isAlive ? 'var(--error-color)' : (latency > 150 ? 'var(--warning-color)' : 'var(--accent-color)') }}>
            {isAlive ? Math.round(latency) : '--'}
            <span className="latency-unit">{isAlive ? 'ms' : ''}</span>
          </div>
        </div>
      </div>

      <div className="chart-container">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={target.history}>
            <defs>
              <linearGradient id={`gradient-${target.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <Tooltip 
              contentStyle={{ backgroundColor: '#171c26', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
              itemStyle={{ color: '#f3f4f6' }}
              labelStyle={{ display: 'none' }}
            />
            <YAxis hide domain={[0, 'dataMax + 20']} />
            <Line 
              type="monotone" 
              dataKey="time" 
              stroke="#3b82f6" 
              strokeWidth={2} 
              dot={false}
              animationDuration={300}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="metrics-grid">
        <div className="metric-item">
          <span className="metric-label">Min</span>
          <span className="metric-value">{lastPing ? Math.round(lastPing.min) : '--'}ms</span>
        </div>
        <div className="metric-item">
          <span className="metric-label">Max</span>
          <span className="metric-value">{lastPing ? Math.round(lastPing.max) : '--'}ms</span>
        </div>
        <div className="metric-item">
          <span className="metric-label">Avg</span>
          <span className="metric-value">{lastPing ? Math.round(lastPing.avg) : '--'}ms</span>
        </div>
        <div className="metric-item">
          <span className="metric-label">Loss</span>
          <span className="metric-value" style={{ color: lastPing && lastPing.packetLoss !== '0%' ? 'var(--error-color)' : 'var(--success-color)' }}>
            {lastPing ? lastPing.packetLoss : '--'}
          </span>
        </div>
      </div>

      <div className="card-footer">
        <div className="status-indicator">
          <span className={`status-text ${statusClass}`}>{statusText}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--text-secondary)' }}>
          <Activity size={12} />
          <span>Last checked: {lastPing ? new Date(lastPing.timestamp).toLocaleTimeString() : 'Never'}</span>
        </div>
      </div>
    </div>
  );
}

export default App;
