import React from 'react';
import { Route, Routes } from 'react-router-dom';
import LandingPage from './pages/LandingPage.jsx';
import StudentPage from './pages/StudentPage.jsx';
import StaffPage from './pages/StaffPage.jsx';

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/student" element={<StudentPage />} />
      <Route path="/staff" element={<StaffPage />} />
    </Routes>
  );
}

export default App;
