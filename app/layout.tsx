import type { Metadata } from "next";
import "./globals.css";
import "./portfolio.css";
import "./portfolio-table.css";
import "./portfolio-layout-fix.css";
import "./visual-polish.css";
import "./watchlist.css";
import "./desktop-light.css";
import "./pro-dashboard.css";
import "./site-nav.css";
import "./operations-refresh.css";

export const metadata: Metadata = {
  title: "ماهر هيرو | محلل الأسهم الذكي",
  description: "فلترة وتحليل فرص الأسهم وفق استراتيجية ماهر هيرو",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        {children}
        <nav className="site-quick-nav" aria-label="التنقل السريع">
          <a href="/">غرفة العمليات</a>
          <a href="/profits">الأرباح المحققة</a>
        </nav>
      </body>
    </html>
  );
}
