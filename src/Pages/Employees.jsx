import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import EmployeeList from "../components/employees/EmployeeList";
import { searchVariants } from "@/lib/layoutSwap";
import EmployeeForm from "../components/employees/EmployeeForm";
import LeaveOverview from "../components/employees/LeaveOverview.jsx";
import { useOrg } from '@/org/OrgContext.jsx';
import { DEFAULT_LEAVE_POLICY, DEFAULT_LEAVE_PAY_POLICY, normalizeLeavePolicy, normalizeLeavePayPolicy } from "@/lib/leave.js";
import { useSupabase } from '@/context/SupabaseContext.jsx';
import { fetchEmployeesList, updateEmployee as updateEmployeeRequest } from '@/api/employees.js';

const GENERIC_RATE_SERVICE_ID = '00000000-0000-0000-0000-000000000000';

const getLedgerTimestamp = (entry = {}) => {
  const raw = entry.date || entry.entry_date || entry.effective_date || entry.change_date || entry.created_at;
  if (!raw) return 0;
  const parsed = new Date(raw);
  const value = parsed.getTime();
  return Number.isNaN(value) ? 0 : value;
};

const sortLeaveLedger = (entries = []) => {
  return [...entries].sort((a, b) => getLedgerTimestamp(a) - getLedgerTimestamp(b));
};

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [rateHistories, setRateHistories] = useState([]);
  const [filteredEmployees, setFilteredEmployees] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("active");
  const [isLoading, setIsLoading] = useState(true);
  const [services, setServices] = useState([]);
  const [activeView, setActiveView] = useState('list');
  const [leaveBalances, setLeaveBalances] = useState([]);
  const [leavePolicy, setLeavePolicy] = useState(DEFAULT_LEAVE_POLICY);
  const [leavePayPolicy, setLeavePayPolicy] = useState(DEFAULT_LEAVE_PAY_POLICY);
  const { tenantClientReady, activeOrgHasConnection, activeOrg, activeOrgId } = useOrg();
  const { authClient, user, loading, session } = useSupabase();

  const loadData = useCallback(async () => {
    if (!tenantClientReady || !activeOrgHasConnection || !session || !activeOrgId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const bundle = await fetchEmployeesList({ session, orgId: activeOrgId });
      const employeeRecords = Array.isArray(bundle?.employees) ? bundle.employees : [];
      const rateHistoryRecords = Array.isArray(bundle?.rateHistory) ? bundle.rateHistory : [];
      const serviceRecords = Array.isArray(bundle?.services) ? bundle.services : [];
      const leaveLedgerRecords = Array.isArray(bundle?.leaveBalances) ? bundle.leaveBalances : [];

      setEmployees(employeeRecords);
      setRateHistories(rateHistoryRecords);
      const filteredServices = serviceRecords.filter(service => service.id !== GENERIC_RATE_SERVICE_ID);
      setServices(filteredServices);
      setLeaveBalances(sortLeaveLedger(leaveLedgerRecords));

      setLeavePolicy(
        bundle?.leavePolicy
          ? normalizeLeavePolicy(bundle.leavePolicy)
          : DEFAULT_LEAVE_POLICY,
      );

      setLeavePayPolicy(
        bundle?.leavePayPolicy
          ? normalizeLeavePayPolicy(bundle.leavePayPolicy)
          : DEFAULT_LEAVE_PAY_POLICY,
      );
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error("שגיאה בטעינת הנתונים");
    }
    setIsLoading(false);
  }, [tenantClientReady, activeOrgHasConnection, session, activeOrgId]);

  const filterEmployees = useCallback(() => {
    let filtered = employees;
    if (activeTab === "active") filtered = filtered.filter(emp => emp.is_active);
    else if (activeTab === "inactive") filtered = filtered.filter(emp => !emp.is_active);
    if (searchTerm) {
      const variants = searchVariants(searchTerm);
      filtered = filtered.filter(emp => {
        const name = (emp.name || '').toLowerCase();
        const id = (emp.employee_id || '').toLowerCase();
        return variants.some(v => name.includes(v) || id.includes(v));
      });
    }
    setFilteredEmployees(filtered);
  }, [employees, searchTerm, activeTab]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { filterEmployees(); }, [filterEmployees]);

  const handleEdit = (employee) => {
    setEditingEmployee(employee);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingEmployee(null);
    loadData();
  };

  const handleToggleActive = async (employee) => {
    try {
      await updateEmployeeRequest({
        session,
        orgId: activeOrgId,
        employeeId: employee.id,
        body: { updates: { is_active: !employee.is_active } },
      });
      toast.success('סטטוס העובד עודכן בהצלחה.');
      loadData();
    } catch (error) {
      console.error('Failed to toggle employee status', error);
      toast.error('עדכון סטטוס העובד נכשל.');
    }
  };

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
        יש להתחבר כדי להציג את רשימת העובדים.
      </div>
    );
  }

  if (!activeOrgHasConnection || !activeOrg) {
    return (
      <div className="p-6 text-center text-slate-500">
        בחרו ארגון עם חיבור פעיל כדי להמשיך.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">ניהול עובדים</h1>
            <p className="text-slate-600">נהל את פרטי העובדים ותעריפיהם</p>
          </div>
          <Button onClick={() => { setEditingEmployee(null); setShowForm(true); }} className="bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600 text-white shadow-lg">
            <Plus className="w-5 h-5 ml-2" />
            הוסף עובד חדש
          </Button>
        </div>
        {showForm ? (
          <EmployeeForm
            employee={editingEmployee}
            services={services}
            rateHistories={rateHistories}
            onSuccess={handleFormSuccess}
            onCancel={() => { setShowForm(false); setEditingEmployee(null); }}
          />
        ) : (
          <Tabs value={activeView} onValueChange={setActiveView} className="w-full space-y-6">
            <TabsList className="grid w-full sm:w-[320px] grid-cols-2 bg-white">
              <TabsTrigger value="list">רשימת עובדים</TabsTrigger>
              <TabsTrigger value="leave">חופשות וחגים</TabsTrigger>
            </TabsList>
            <TabsContent value="list" className="space-y-6">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <Input
                    placeholder="חפש עובד..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pr-10"
                  />
                </div>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full md:w-auto">
                  <TabsList className="grid w-full md:w-auto grid-cols-3 bg-white">
                    <TabsTrigger value="all">הכל</TabsTrigger>
                    <TabsTrigger value="active">פעילים</TabsTrigger>
                    <TabsTrigger value="inactive">לא פעילים</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <EmployeeList
                employees={filteredEmployees}
                rateHistories={rateHistories}
                services={services}
                onEdit={handleEdit}
                onToggleActive={handleToggleActive}
                isLoading={isLoading}
              />
            </TabsContent>
            <TabsContent value="leave">
              <LeaveOverview
                employees={employees}
                leaveBalances={leaveBalances}
                leavePolicy={leavePolicy}
                leavePayPolicy={leavePayPolicy}
                onRefresh={loadData}
                isLoading={isLoading}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
