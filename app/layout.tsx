import { cookies } from "next/headers"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { THEME_COOKIE_KEY, isThemeValue } from "@/lib/theme-cookie"
import { TooltipProvider } from "@/components/ui/tooltip"

export const metadata = {
  title: "TRACE",
  description:
    "Tracking, Records & Case Evidence — shared digital records for regular and traffic policing.",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const cookieStore = await cookies()
  const cookieTheme = cookieStore.get(THEME_COOKIE_KEY)?.value
  const defaultTheme = isThemeValue(cookieTheme) ? cookieTheme : "system"

  return (
    <html lang="en" suppressHydrationWarning className="antialiased">
      <body>
        <ThemeProvider defaultTheme={defaultTheme}>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
