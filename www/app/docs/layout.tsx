import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';

export default function Layout({ children }: LayoutProps<'/docs'>) {
  const docsOptions = {
    ...baseOptions(),
    links: [], // Clear links in sidebar
  };

  return (
    <DocsLayout tree={source.getPageTree()} {...docsOptions}>
      {children}
    </DocsLayout>
  );
}
