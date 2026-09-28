import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "RoboSpace Fit — 공간분석 스튜디오",
  description:
    "식품 포장공정 로봇 배치, 작업범위, 동선과 경제성을 한 공간에서 검토하는 RoboSpace Fit.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="dark">
      <body>{children}</body>
    </html>
  );
}
