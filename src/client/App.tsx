import { Routes, Route } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useSocket } from './hooks/useSocket';
import Dashboard from './pages/Dashboard';
import Terminal from './pages/Terminal';
import Files from './pages/Files';
import Git from './pages/Git';
import Qdrant from './pages/Qdrant';
import Layout from './components/Layout';

function App() {
  const { connected, socket } = useSocket();
  const [systemStatus, setSystemStatus] = useState<'loading' | 'healthy' | 'error'>('loading');

  useEffect(() => {
    // Check API health on mount
    fetch('/api/health')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setSystemStatus('healthy');
        } else {
          setSystemStatus('error');
        }
      })
      .catch(() => setSystemStatus('error'));
  }, []);

  useEffect(() => {
    if (socket) {
      socket.on('connect', () => {
        console.log('Socket connected');
      });

      socket.on('disconnect', () => {
        console.log('Socket disconnected');
      });

      return () => {
        socket.off('connect');
        socket.off('disconnect');
      };
    }
  }, [socket]);

  return (
    <Layout connected={connected} systemStatus={systemStatus}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/terminal" element={<Terminal />} />
        <Route path="/files" element={<Files />} />
        <Route path="/git" element={<Git />} />
        <Route path="/qdrant" element={<Qdrant />} />
      </Routes>
    </Layout>
  );
}

export default App;
