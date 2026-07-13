import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DeliveryPróprio",
  description: "PWA de pedidos white-label para lanchonetes, bares e restaurantes.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
