import React, { useState } from "react";
import { Link, useLocation, Outlet } from "react-router-dom";
import { Toaster, toast } from "sonner";
import {
  Calendar,
  Users,
  Clock,
  BarChart3,
  Settings,
  SlidersHorizontal,
  LogOut,
  UserRound,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import ChangelogModal from "./components/ChangelogModal";
import OrgConfigBanner from "@/components/OrgConfigBanner.jsx";
import OrgSelectionBanner from "@/components/OrgSelectionBanner.jsx";
import { useAuth } from "@/auth/AuthContext.jsx";
import { useOrg } from "@/org/OrgContext.jsx";
import OrgSwitcher from "@/org/OrgSwitcher.jsx";

const navigationItems = [
  {
    title: "לוח בקרה",
    url: "/Dashboard",
    icon: Calendar,
  },
  {
    title: "עובדים",
    url: "/Employees",
    icon: Users,
  },
  {
    title: "שירותים",
    url: "/Services",
    icon: Settings,
  },
  {
    title: "רישום זמנים",
    url: "/TimeEntry",
    icon: Clock,
  },
  {
    title: "דוחות",
    url: "/Reports",
    icon: BarChart3,
  },
  {
    title: "הגדרות",
    url: "/Settings",
    icon: SlidersHorizontal,
  },
];

export default function Layout({ children }) {
  const location = useLocation();
  const [showChangelog, setShowChangelog] = useState(false);
  const { user, signOut } = useAuth();
  const { activeOrg } = useOrg();

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success("התנתקת בהצלחה");
    } catch (error) {
      console.error("Sign-out failed", error);
      toast.error("אירעה שגיאה בהתנתקות. נסה שוב.");
    }
  };

  return (
    <SidebarProvider>
      <style>{`
        * {
          direction: rtl;
        }
        .sidebar-content {
          text-align: right;
        }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
      `}</style>
      <div className="min-h-screen flex w-full bg-gradient-to-br from-slate-50 to-blue-50" dir="rtl">
        <Sidebar className="border-l border-slate-200" side="right">
          <SidebarHeader className="border-b border-slate-200 p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-green-500 rounded-xl flex items-center justify-center">
                <Clock className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900 text-lg">ניהול עובדים</h2>
                <p className="text-sm text-slate-500">מערכת רישום זמנים</p>
              </div>
            </div>
          </SidebarHeader>
          
          <SidebarContent className="p-4">
            <SidebarGroup>
              <SidebarGroupLabel className="text-sm font-semibold text-slate-600 mb-3">
                ניווט
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="space-y-2">
                  {navigationItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton 
                        asChild 
                        className={`hover:bg-blue-50 hover:text-blue-700 transition-all duration-200 rounded-lg ${
                          location.pathname === item.url ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-slate-700'
                        }`}
                      >
                        <Link to={item.url} className="flex items-center gap-3 px-4 py-3">
                          <item.icon className="w-5 h-5" />
                          <span className="font-medium">{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="border-t border-slate-200 p-6 space-y-4">
            <OrgSwitcher />
            <button
              onClick={() => setShowChangelog(true)}
              style={{
                width: '100%',
                background: 'linear-gradient(90deg, #6366f1 0%, #60a5fa 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '8px 0',
                fontSize: 16,
                fontWeight: 500,
                boxShadow: '0 2px 8px 0 rgba(60,60,120,0.10)',
                cursor: 'pointer',
                letterSpacing: '0.5px',
                transition: 'background 0.2s',
              }}
            >עדכונים</button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-r from-green-400 to-blue-500 rounded-full flex items-center justify-center">
                <UserRound className="w-5 h-5 text-white" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0 text-right">
                <p className="font-semibold text-slate-900 text-sm truncate">{user?.name || user?.email || 'משתמש מחובר'}</p>
                {user?.email && <p className="text-xs text-slate-500 truncate">{user.email}</p>}
                <p className="text-xs text-blue-600 truncate">
                  {activeOrg?.name ? `ארגון: ${activeOrg.name}` : 'לא נבחר ארגון'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="p-2 rounded-full hover:bg-slate-100 transition-colors"
                aria-label="התנתק"
              >
                <LogOut className="w-4 h-4 text-slate-600" />
              </button>
            </div>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 flex flex-col">
          <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200 px-6 py-4 md:hidden">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="hover:bg-slate-100 p-2 rounded-lg transition-colors duration-200" />
              <h1 className="text-xl font-bold text-slate-900">ניהול עובדים</h1>
            </div>
          </header>

          <OrgSelectionBanner />
          <OrgConfigBanner />

          <div className="flex-1 overflow-auto">
            {children ?? <Outlet />}
          </div>
        </main>
      </div>
      <ChangelogModal open={showChangelog} onClose={() => setShowChangelog(false)} />
      <Toaster richColors position="top-right" closeButton />
    </SidebarProvider>
  );
}
