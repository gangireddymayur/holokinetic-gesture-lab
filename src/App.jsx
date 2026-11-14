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
        <ProjectionInterface onSwitchMode={() => setAppMode('holokinetic')} />
      )}
    </div>
  );
}

export default App;
