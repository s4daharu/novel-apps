import React, { useState } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { Tool } from '../types';

interface LayoutProps {
  title: string;
  tools: Record<string, Tool>;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ title, tools, children }) => {
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setSidebarOpen(!isSidebarOpen);
  };
  
  const navigate = (path: string) => {
      window.location.hash = path;
      setSidebarOpen(false);
  };

  return (
    <>
      <Header title={title} onToggleMenu={toggleSidebar} />
      <Sidebar isOpen={isSidebarOpen} onNavigate={navigate} tools={tools} />
      {children}
    </>
  );
};
