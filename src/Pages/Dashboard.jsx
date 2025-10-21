import React, { useState, useEffect, useCallback } from 'react';
import { useOrg } from '@/org/OrgContext.jsx';
import { fetchLeavePayPolicySettings } from '@/lib/settings-client.js';
import { fetchEmployeesList } from '@/api/employees.js';
import { fetchWorkSessions } from '@/api/work-sessions.js';
import { getServices } from '@/api/services.js';
import QuickStats from '../components/dashboard/QuickStats';
import MonthlyCalendar from '../components/dashboard/MonthlyCalendar';
import RecentActivity from '../components/dashboard/RecentActivity';
import { toast } from "sonner";
import { DEFAULT_LEAVE_PAY_POLICY, normalizeLeavePayPolicy } from '@/lib/leave.js';
import { useSupabase } from '@/context/SupabaseContext.jsx';

const GENERIC_RATE_SERVICE_ID = '00000000-0000-0000-0000-000000000000';

export default function Dashboard() {
  const [employees, setEmployees] = useState([]);
  const [workSessions, setWorkSessions] = useState([]);
  const [services, setServices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [leavePayPolicy, setLeavePayPolicy] = useState(DEFAULT_LEAVE_PAY_POLICY);
  const { tenantClientReady, activeOrgHasConnection, activeOrgId } = useOrg();
  const { dataClient, authClient, user, loading, session } = useSupabase();

  const loadData = useCallback(async () => {
    if (!tenantClientReady || !activeOrgHasConnection || !dataClient || !session || !activeOrgId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const bundle = await fetchEmployeesList({ session, orgId: activeOrgId });
      const employeeRecords = Array.isArray(bundle?.employees) ? bundle.employees : [];
      setEmployees(employeeRecords.filter((emp) => emp?.is_active !== false));

      const [sessionsResponse, servicesResponse, leavePayPolicySettings] = await Promise.all([
        fetchWorkSessions({ session, orgId: activeOrgId }),
        getServices({ session, orgId: activeOrgId }),
        fetchLeavePayPolicySettings({ session, orgId: activeOrgId }),
      ]);

      const safeSessions = Array.isArray(sessionsResponse?.sessions)
        ? sessionsResponse.sessions.filter((item) => !item?.deleted)
        : [];
      safeSessions.sort((a, b) => {
        const createdA = a?.created_at ? new Date(a.created_at).getTime() : 0;
        const createdB = b?.created_at ? new Date(b.created_at).getTime() : 0;
        return createdB - createdA;
      });
      setWorkSessions(safeSessions);

      const filteredServices = Array.isArray(servicesResponse?.services)
        ? servicesResponse.services.filter((service) => service.id !== GENERIC_RATE_SERVICE_ID)
        : [];
      setServices(filteredServices);
      setLeavePayPolicy(
        leavePayPolicySettings.value
          ? normalizeLeavePayPolicy(leavePayPolicySettings.value)
          : DEFAULT_LEAVE_PAY_POLICY,
      );

    } catch (error) {
      console.error("Error loading dashboard data:", error);
      toast.error("שגיאה בטעינת נתוני הדשבורד");
    }
    setIsLoading(false);
  }, [tenantClientReady, activeOrgHasConnection, dataClient, session, activeOrgId]);

  useEffect(() => { loadData(); }, [loadData]);

  // הרשומות מסודרות כברירת מחדל לפי created_at כשהן נטענות
  const recentSessions = (workSessions || []).slice(0, 5);

  if (loading || !authClient) {
    return (
      <div className="p-6 text-center text-slate-500">
        טוען חיבור Supabase...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6 text-center text-slate-500">
        נדרש להתחבר לפני הצגת הדשבורד.
      </div>
    );
  }

  if (!dataClient) {
    return (
      <div className="p-6 text-center text-slate-500">
        בחרו ארגון עם חיבור Supabase פעיל כדי להציג נתונים.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">לוח בקרה</h1>
          <p className="text-slate-600">סקירה כללית של הפעילות במערכת</p>
        </div>
        
        <QuickStats
          employees={employees}
          workSessions={workSessions}
          services={services}
          currentDate={currentDate}
          leavePayPolicy={leavePayPolicy}
          isLoading={isLoading}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <MonthlyCalendar 
              currentDate={currentDate}
              setCurrentDate={setCurrentDate}
              workSessions={workSessions}
              employees={employees}
              isLoading={isLoading}
            />
          </div>
          <div className="lg:col-span-1">
            <RecentActivity
              sessions={recentSessions} // מעבירים את הרשימה החתוכה
              employees={employees}
              services={services}
              workSessions={workSessions}
              leavePayPolicy={leavePayPolicy}
              isLoading={isLoading}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
