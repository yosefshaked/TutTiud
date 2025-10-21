import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO, startOfMonth, endOfMonth, eachMonthOfInterval } from "date-fns";
import { he } from "date-fns/locale";

const COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#06B6D4'];

export default function ChartsOverview({ sessions, employees, isLoading, services, workSessions = [] }) {
  const [pieType, setPieType] = React.useState('count');
  const [trendType, setTrendType] = React.useState('payment');
  
  // Aggregate sessions by type for the pie chart (count vs time)
  // Must be declared before any early returns to preserve hook order
  const sessionsByType = React.useMemo(() => {
    if (!sessions || !employees || !services) return [];

    const totals = new Map();
    const employeeById = new Map(employees.map(e => [e.id, e]));
    const serviceById = new Map(services.map(s => [s.id, s]));

    const sessionTypeToHours = (session) => {
      if (session.hours != null) return session.hours;
      switch (session.session_type) {
        case 'session_30':
          return 0.5 * (session.sessions_count || 0);
        case 'session_45':
          return 0.75 * (session.sessions_count || 0);
        case 'session_150':
          return 2.5 * (session.sessions_count || 0);
        default:
          return 0;
      }
    };

    for (const s of sessions) {
      const emp = employeeById.get(s.employee_id);
      if (!emp || !emp.is_active) continue;

      // Only include instructor sessions in the pie
      if (emp.employee_type !== 'instructor') continue;

      const service = serviceById.get(s.service_id);
      const name = service ? service.name : 'Unknown Service';
      const value = pieType === 'count'
        ? (s.sessions_count || 0)
        : (service && service.duration_minutes
            ? (service.duration_minutes / 60) * (s.sessions_count || 0)
            : sessionTypeToHours(s));
      if (!value) continue;
      totals.set(name, (totals.get(name) || 0) + value);
    }

    return Array.from(totals, ([name, value]) => ({ name, value }));
  }, [sessions, employees, services, pieType]);

  const paymentByEmployee = React.useMemo(() => {
    if (!sessions || !employees) return [];

    const employeeById = new Map(employees.map(emp => [emp.id, emp]));
    const totals = new Map();

    for (const session of sessions) {
      const employee = employeeById.get(session.employee_id);
      if (!employee || !employee.is_active) continue;
      if (employee.start_date && session.date < employee.start_date) continue;

      const amount = Number(session.total_payment) || 0;
      if (!totals.has(employee.id)) {
        totals.set(employee.id, { name: employee.name, payment: 0, sessions: 0 });
      }

      const bucket = totals.get(employee.id);
      bucket.payment += amount;
      bucket.sessions += 1;
    }

    return Array.from(totals.values()).filter(item => item.payment !== 0);
  }, [sessions, employees]);

  if (isLoading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-80 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Skeleton className="h-60" />
          <Skeleton className="h-60" />
        </div>
      </div>
    );
  }

  // Monthly trend based on filtered range (fallback to last 6 months)
  let startDate, endDate;
  if (sessions.length > 0) {
    const dates = sessions.map(s => parseISO(s.date));
    startDate = startOfMonth(new Date(Math.min(...dates)));
    endDate = endOfMonth(new Date(Math.max(...dates)));
  } else {
    const now = new Date();
    endDate = now;
    startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  }
  const months = eachMonthOfInterval({ start: startDate, end: endDate });
  const monthlyData = months.map(month => {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    const monthSessions = (workSessions.length ? workSessions : sessions).filter(session => {
      const sessionDate = parseISO(session.date);
      return sessionDate >= monthStart && sessionDate <= monthEnd;
    });
    let payment = 0, hours = 0, sessionsCount = 0;
    const employeesById = Object.fromEntries(employees.map(e => [e.id, e]));
    monthSessions.forEach(session => {
      const employee = employeesById[session.employee_id];
      if (!employee || !employee.is_active) return;
      if (employee.start_date && session.date < employee.start_date) return;
      payment += Number(session.total_payment) || 0;
      if (session.entry_type === 'hours') {
        hours += session.hours || 0;
        sessionsCount += session.hours || 0;
      } else if (session.entry_type === 'session') {
        const service = services.find(s => s.id === session.service_id);
        if (service && service.duration_minutes) {
          hours += (service.duration_minutes / 60) * (session.sessions_count || 0);
        }
        sessionsCount += session.sessions_count || 0;
      }
    });
    return {
      month: format(month, 'MMM', { locale: he }),
      payment,
      sessions: sessionsCount,
      hours
    };
  });

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold mb-4">תשלומים לפי עובד</h3>
        <div className="w-full overflow-x-auto">
          <BarChart width={Math.max(800, paymentByEmployee.length * 120)} height={320} data={paymentByEmployee} margin={{ left: 50, right: 30, top: 20, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="name"
              tick={{ fontSize: 15, angle: 0, textAnchor: 'middle', width: 120, wordBreak: 'break-all' }}
              interval={0}
              height={60}
              padding={{ left: 30, right: 10 }}
            />
            <YAxis />
            <Tooltip formatter={(value) => [`₪${value.toLocaleString()}`, 'שכר']} />
            <Legend verticalAlign="top" align="center" layout="horizontal" height={36} />
            <Bar dataKey="payment" fill="#3B82F6" name="שכר (₪)" barSize={40} radius={[8, 8, 0, 0]} label={{ position: 'top', fill: '#3B82F6', fontSize: 14 }} />
          </BarChart>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <h3 className="text-lg font-semibold mb-4">התפלגות לפי סוג מפגש</h3>
          {sessions.length === 0 ? (
            <div className="text-center text-slate-500 py-12">אין נתונים להצגה</div>
          ) : sessionsByType.length === 0 ? (
            <div className="text-center text-slate-500 py-12">כל המפגשים הם מסוג לא ידוע</div>
          ) : (
            <div>
              <div className="mb-2 flex gap-2 justify-center">
                <button
                  className={`px-3 py-1 rounded ${pieType === 'count' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
                  onClick={() => setPieType('count')}
                >
                  לפי מספר מפגשים
                </button>
                <button
                  className={`px-3 py-1 rounded ${pieType === 'time' ? 'bg-green-500 text-white' : 'bg-gray-200'}`}
                  onClick={() => setPieType('time')}
                >
                  לפי שעות
                </button>
              </div>
              <PieChart width={400} height={280}>
                <Pie
                  data={sessionsByType}
                  cx={200}
                  cy={140}
                  labelLine={false}
                  label={({ percent, x, y }) => (
                    <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={16} fill="#222">
                      {`${(percent * 100).toFixed(0)}%`}
                    </text>
                  )}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                  paddingAngle={2}
                >
                  {sessionsByType.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, name, props) => {
                  const entry = props && props.payload;
                  // Show service name and value type
                  const labelType = pieType === 'count' ? 'מפגשים' : 'שעות';
                  const text = `${entry.name}:\n${value} ${labelType}`;
                  const lines = text.length > 40 ? text.match(/.{1,40}/g) : [text];
                  return [lines.map((line, i) => <div key={i}>{line}</div>)];
                }} />
              </PieChart>
              <div className="flex flex-wrap justify-center mt-4 gap-4">
                {sessionsByType.map((entry, index) => (
                  <div key={entry.name} className="flex items-center gap-2">
                    <span style={{ width: 16, height: 16, background: COLORS[index % COLORS.length], display: 'inline-block', borderRadius: 4 }}></span>
                    <span className="text-sm text-slate-700">{entry.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-4">מגמה חודשית (6 חודשים אחרונים)</h3>
          <div className="mb-2 flex gap-2">
            <button
              className={`px-3 py-1 rounded ${trendType === 'payment' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
              onClick={() => setTrendType('payment')}
            >
              שכר
            </button>
            <button
              className={`px-3 py-1 rounded ${trendType === 'sessions' ? 'bg-green-500 text-white' : 'bg-gray-200'}`}
              onClick={() => setTrendType('sessions')}
            >
              מפגשים
            </button>
          </div>
          <LineChart width={440} height={270} data={monthlyData} margin={{ left: 20, right: 20, top: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={{ fontSize: 13 }} padding={{ left: 10, right: 10 }} />
            <YAxis />
            <Tooltip formatter={(value, name) => {
              if (trendType === 'payment') {
                return [`₪${value.toLocaleString()}`, 'תשלום (₪)'];
              }
              if (trendType === 'sessions') {
                return [value, 'מפגשים'];
              }
              return [value, name];
            }} />
            <Legend verticalAlign="top" height={36} />
            {trendType === 'payment' && (
              <Line type="monotone" dataKey="payment" stroke="#3B82F6" name="שכר (₪)" dot={{ r: 5 }} strokeWidth={3} label={({ x, y, value }) => <text x={x} y={y - 10} textAnchor="middle" fontSize={13} fill="#3B82F6">₪{value.toLocaleString()}</text>} />
            )}
            {trendType === 'sessions' && (
              <Line type="monotone" dataKey="sessions" stroke="#10B981" name="מפגשים" dot={{ r: 5 }} strokeWidth={3} label={({ x, y, value }) => <text x={x} y={y - 10} textAnchor="middle" fontSize={13} fill="#10B981">{value}</text>} />
            )}
          </LineChart>
        </div>
      </div>
    </div>
  );
}
