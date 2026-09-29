import './globals.css';
import Script from 'next/script';

export const metadata = {
  title: 'My Dashboard',
  description: 'Personal dashboard',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body className="bg-white text-neutral-900">
        {children}
        <Script src="https://cdn.jsdelivr.net/npm/lucide@0.513.0/dist/umd/lucide.min.js" strategy="beforeInteractive" />
      </body>
    </html>
  );
}
