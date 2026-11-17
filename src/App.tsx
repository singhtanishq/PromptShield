import { useEffect } from 'react';
import { AppShell } from './app/AppShell';
import { SettingsProvider } from './app/settings';
import { useRoute } from './app/router';
import { ToastProvider } from './components/toast';
import { SessionProvider } from './features/sanitizer/session';
import { RulesProvider } from './features/rules/RulesProvider';
import { SanitizerView } from './features/sanitizer/SanitizerView';
import { RulesView } from './features/rules/RulesView';
import { SettingsView } from './features/settings/SettingsView';
import { PrivacyView } from './features/privacy/PrivacyView';
import { GuidesView } from './features/guides/GuidesView';
import { AboutView } from './features/about/AboutView';

const TITLES: Record<string, string> = {
  sanitizer: 'Sanitize a prompt',
  rules: 'Custom rules',
  settings: 'Settings',
  privacy: 'Privacy center',
  guides: 'Guides',
  about: 'About',
};

function Routes() {
  const route = useRoute();

  useEffect(() => {
    document.title = `${TITLES[route] ?? 'PromptShield'} · PromptShield`;
  }, [route]);

  switch (route) {
    case 'rules':
      return <RulesView />;
    case 'settings':
      return <SettingsView />;
    case 'privacy':
      return <PrivacyView />;
    case 'guides':
      return <GuidesView />;
    case 'about':
      return <AboutView />;
    case 'sanitizer':
    default:
      return <SanitizerView />;
  }
}

export default function App() {
  return (
    <SettingsProvider>
      <ToastProvider>
        <RulesProvider>
          <SessionProvider>
            <AppShell>
              <Routes />
            </AppShell>
          </SessionProvider>
        </RulesProvider>
      </ToastProvider>
    </SettingsProvider>
  );
}
