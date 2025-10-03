import { useState, useEffect, useCallback } from 'react';

const getHash = () => window.location.hash.substring(1) || 'dashboard';

export const useHashRouter = () => {
  const [route, setRoute] = useState(getHash());

  const handleHashChange = useCallback(() => {
    setRoute(getHash());
  }, []);

  useEffect(() => {
    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [handleHashChange]);

  const navigate = (path: string) => {
      if (path === 'dashboard') {
          window.location.hash = '#dashboard';
      } else {
          window.location.hash = `#tool-${path}`;
      }
  };

  return { route, navigate };
};
