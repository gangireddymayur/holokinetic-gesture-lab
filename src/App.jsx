import React, { useState } from 'react';
import HoloKineticLab from './components/HoloKineticLab';
import ProjectionInterface from './components/ProjectionInterface';

function App() {
  // 'holokinetic' (two-hand 3D physics lab) | 'chronogrip' (gesture time scrubber)
  const [appMode, setAppMode] = useState('holokinetic');

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {appMode === 'holokinetic' ? (
        <HoloKineticLab onSwitchMode={() => setAppMode('chronogrip')} />
      ) : (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          {/* Floating Switcher to jump back to HoloKinetic */}
          <button
            onClick={() => setAppMode('holokinetic')}
            style={{
              position: 'absolute',
              top: '18px',
              right: '180px',
              zIndex: 60,
              background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.3), rgba(99, 102, 241, 0.3))',
              border: '1px solid #00f2fe',
              color: '#ffffff',
              padding: '7px 14px',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '700',
              fontFamily: 'Orbitron, sans-serif',
              boxShadow: '0 0 15px rgba(0, 242, 254, 0.4)',
              backdropFilter: 'blur(12px)'
            }}
          >
            🦾 HoloKinetic Lab
          </button>
          <ProjectionInterface />
        </div>
      )}
    </div>
  );
}

export default App;
