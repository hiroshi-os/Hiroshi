import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className="font-mono" suppressHydrationWarning>
      <body className="flex flex-col min-h-screen font-mono">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
