import React from 'react';
import { Tool } from '../types';

interface SidebarProps {
  isOpen: boolean;
  onNavigate: (path: string) => void;
  tools: Record<string, Tool>;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onNavigate, tools }) => {
  return (
    <div 
      id="sidebar"
      className={`fixed top-0 right-0 w-64 h-full bg-slate-100 dark:bg-slate-800 border-l border-gray-200 dark:border-slate-700 transform transition-transform duration-300 ease-in-out md:translate-x-0 z-40 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
    >
      <div className="p-6 pt-20">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Tools</h2>
        <nav className="space-y-2">
          <button onClick={() => onNavigate('#dashboard')} className="w-full text-left px-4 py-3 rounded-lg text-slate-600 dark:text-slate-300 hover:text-primary-600 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 transition-all duration-200">
            Home Dashboard
          </button>
          {/* FIX: Add explicit type for 'tool' to resolve TypeScript inference error where it was being treated as 'unknown'. */}
          {Object.values(tools).map((tool: Tool) => (
            <button key={tool.id} onClick={() => onNavigate(`#tool-${tool.id}`)} className="w-full text-left px-4 py-3 rounded-lg text-slate-600 dark:text-slate-300 hover:text-primary-600 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 transition-all duration-200">
              {tool.title}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
};