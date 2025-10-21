export const calculateRowPayment = (row, employee, services, getRateForDate) => {
  const isHourlyOrGlobal = employee.employee_type === 'hourly' || employee.employee_type === 'global';
  const { rate } = getRateForDate(employee.id, row.date, isHourlyOrGlobal ? null : row.service_id);
  
  if (employee.employee_type === 'hourly') {
    return (parseFloat(row.hours) || 0) * rate;
  }
  if (employee.employee_type === 'global') {
    return 0; // Time entries for global employees are for tracking, not payment.
  }
  if (employee.employee_type === 'instructor') {
    const service = services.find(s => s.id === row.service_id);
    if (service) {
      if (service.payment_model === 'per_student') {
        return (parseInt(row.sessions_count, 10) || 1) * (parseInt(row.students_count, 10) || 0) * rate;
      } else {
        return (parseInt(row.sessions_count, 10) || 1) * rate;
      }
    }
  }
  return 0;
};