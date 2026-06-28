import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';

export default function Layout({ children }: LayoutProps<'/'>) {
  const homeOptions = {
    ...baseOptions(),
    nav: {
      enabled: false, // Disable native Fumadocs nav bar
    },
  };
  return <HomeLayout {...homeOptions}>{children}</HomeLayout>;
}
