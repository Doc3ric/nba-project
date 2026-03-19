import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import PlayerAnalysis from './pages/PlayerAnalysis';
import GameMatchup from './pages/GameMatchup';
import InjuriesPage from './pages/InjuriesPage';
import { ToastProvider } from './components/common/ToastContext';

function App() {
  return (
    <Router>
      <ToastProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/injuries" element={<InjuriesPage />} />
            <Route path="/player/:id?" element={<PlayerAnalysis />} />
            <Route path="/game/:id" element={<GameMatchup />} />
          </Routes>
        </Layout>
      </ToastProvider>
    </Router>
  );
}

export default App;
