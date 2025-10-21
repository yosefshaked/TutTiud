import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import QuickStats from '../components/dashboard/QuickStats';
import MonthlyCalendar from '../components/dashboard/MonthlyCalendar';
import RecentActivity from '../components/dashboard/RecentActivity';
import { toast } from "sonner";

export default function Dashboard() {
  const [employees, setEmployees] = useState([]);
  const [workSessions, setWorkSessions] = useState([]);
  const [services, setServices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [employeesData, sessionsData, servicesData] = await Promise.all([
        supabase.from('Employees').select('*').eq('is_active', true),
        // === התיקון הסופי והנכון באמת: מיון לפי created_at ===
        supabase.from('WorkSessions').select('*').order('created_at', { ascending: false }),
        supabase.from('Services').select('*')
      ]);

      if (employeesData.error) throw employeesData.error;
      if (sessionsData.error) throw sessionsData.error;
      if (servicesData.error) throw servicesData.error;

      setEmployees(employeesData.data || []);
      setWorkSessions(sessionsData.data || []);
      setServices(servicesData.data || []);

    } catch (error) {
      console.error("Error loading dashboard data:", error);
      toast.error("שגיאה בטעינת נתוני הדשבורד");
    }
    setIsLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  // אנחנו כבר לא צריכים למיין בצד הלקוח, ה-DB עושה את זה
  const recentSessions = (workSessions || []).slice(0, 5);

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
              isLoading={isLoading}
            />
          </div>
        </div>
      </div>
    </div>
  );
}