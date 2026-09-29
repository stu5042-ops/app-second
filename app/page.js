'use client';

import { useEffect } from 'react';
import { initDashboard } from '../legacy/dashboard';

export default function HomePage() {
  useEffect(() => {
    initDashboard();
  }, []);

  return (
    <div className="flex h-screen">
      <div id="sidebar-container" />
      <main id="main-content" className="flex-1 overflow-y-auto" />
    </div>
  );
}
