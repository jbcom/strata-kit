import { Routes, Route } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';

const GettingStarted = lazy(() => import('./pages/GettingStarted'));
const ApiReference = lazy(() => import('./pages/ApiReference'));
const ThemePreview = lazy(() => import('./pages/ThemePreview'));
const AIDemo = lazy(() => import('./pages/demos/AIDemo'));

function Loading() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: '#0a0a0f'
    }}>
      <div style={{
        width: 60,
        height: 60,
        border: '3px solid rgba(17, 205, 239, 0.2)',
        borderTopColor: '#11CDEF',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }} />
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function App() {
  return (
    <Layout>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/getting-started" element={<GettingStarted />} />
          <Route path="/api" element={<ApiReference />} />
          <Route path="/themes" element={<ThemePreview />} />
          <Route path="/demos/ai" element={<AIDemo />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}

export default App;
