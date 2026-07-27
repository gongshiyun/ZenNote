import { useEffect } from 'react';
import { useStore } from './store';
import { AppShell } from './components/layout/AppShell';

function App() {
  const mode = useStore(s => s.mode);
  const setResolvedMode = useStore(s => s.setResolvedMode);
  const themeId = useStore(s => s.themeId);
  const fontFamily = useStore(s => s.fontFamily);

  // Resolve theme (system / light / dark)
  useEffect(() => {
    const applyTheme = () => {
      if (mode === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setResolvedMode(prefersDark ? 'dark' : 'light');
        document.documentElement.classList.toggle('dark', prefersDark);
      } else {
        setResolvedMode(mode);
        document.documentElement.classList.toggle('dark', mode === 'dark');
      }
    };
    applyTheme();

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => { if (mode === 'system') applyTheme(); };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mode, setResolvedMode]);

  // Apply color theme + font attributes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeId);
  }, [themeId]);

  useEffect(() => {
    document.documentElement.setAttribute('data-font', fontFamily);
  }, [fontFamily]);

  return <AppShell />;
}

export default App;