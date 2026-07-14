import type { Metadata } from "next";
import "./globals.css";
import "./portfolio.css";

export const metadata: Metadata = {
  title: "ماهر هيرو | محلل الأسهم الذكي",
  description: "فلترة وتحليل فرص الأسهم وفق استراتيجية ماهر هيرو",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
