import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { docsRoute } from './shared';
import { PixelThemeSwitcher } from '../components/ThemeSwitcher';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <div className="flex items-center space-x-2">
          <div className="h-5 w-5 border border-zinc-700 bg-zinc-900 flex items-center justify-center font-bold text-zinc-100 text-[10px]">
            H
          </div>
          <span className="font-bold tracking-widest text-zinc-100 font-mono text-sm">HIROSHI</span>
        </div>
      ),
    },
    themeSwitch: {
      enabled: false,
    },
    links: [
      {
        text: 'Changelog',
        url: '#',
      },
      {
        text: 'Docs',
        url: docsRoute,
      },
      {
        text: 'Team',
        url: '#',
      },
      {
        text: 'Enterprise',
        url: '#',
      },
      {
        text: 'Join Us',
        url: '#',
      },
      {
        text: 'Download',
        url: '/docs/getting-started/installation',
      },
      {
        type: 'custom',
        children: <PixelThemeSwitcher />,
        secondary: true,
      },
    ],
  };
}
