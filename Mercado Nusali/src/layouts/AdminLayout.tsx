import React from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from '../components/Header';

export const AdminLayout: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col font-sans text-gray-900 antialiased selection:bg-yellow-300">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
};
