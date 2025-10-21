import React, { useState, useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDate, isToday, parseISO } from "date-fns";
import { he } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import TimeEntryForm from './TimeEntryForm'; // Assuming it's in the same folder

export default function TimeEntryTable({ employees, workSessions, services, rateHistories, getRateForDate, onTableSubmit }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [editingCell, setEditingCell] = useState(null); // Will hold { day, employee }

  const daysInMonth = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const goToPreviousMonth = () => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  const goToNextMonth = () => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));

  return (
    <> {/* Using a Fragment (<>) instead of a div to avoid extra wrappers */}
        <Card>
        <CardContent className="p-4">
            {/* Header with Month Navigation */}
            <div className="flex justify-between items-center mb-4">
            <Button variant="outline" size="icon" onClick={goToPreviousMonth}><ChevronRight className="w-4 h-4" /></Button>
            <h2 className="text-xl font-bold">{format(currentMonth, 'MMMM yyyy', { locale: he })}</h2>
            <Button variant="outline" size="icon" onClick={goToNextMonth}><ChevronLeft className="w-4 h-4" /></Button>
            </div>

            {/* Table */}
                <div className="overflow-auto border rounded-lg max-h-[65vh]"> 
                    <Table className="min-w-full">
                        <TableHeader className="sticky top-0 z-20">
                        <TableRow>
                            <TableHead className="sticky w-24 text-right right-0 bg-slate-100 z-20 shadow-sm">תאריך</TableHead>
                            {/* Headers are just the employee names */}
                            {employees.map(emp => (
                            <TableHead key={emp.id} className="top-0 text-center z-20 min-w-[140px] p-2 bg-slate-50 shadow-sm">{emp.name}</TableHead>
                            ))}
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                        {/* Loop through each day of the month to create a row */}
                        {daysInMonth.map(day => (
                            <TableRow key={day.toISOString()}>
                            <TableCell className={`text-right font-semibold sticky right-0 z-10 p-2 ${isToday(day) ? 'bg-blue-100' : 'bg-slate-50'}`}>
                                <div className="flex items-center justify-end gap-2">
                                <span>{format(day, 'd')}</span>
                                <span className="text-xs text-slate-500">{format(day, 'EEE', { locale: he })}</span>
                                </div>
                            </TableCell>
                            
                            {/* For each day, loop through employees to create a cell */}
                            {employees.map(emp => {
                                const dailySessions = workSessions.filter(s => 
                                s.employee_id === emp.id && 
                                format(parseISO(s.date), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd')
                                );

                                let summaryText = '-';
                                let summaryPayment = 0;
                                let displayRate = null;

                                if (dailySessions.length > 0) {
                                summaryPayment = dailySessions.reduce((sum, s) => sum + (s.total_payment || 0), 0);
                                
                                if (emp.employee_type === 'instructor') {
                                    const sessionCount = dailySessions.reduce((sum, s) => sum + (s.sessions_count || 0), 0);
                                    summaryText = `${sessionCount} מפגשים`;
                                } else { // Hourly and Global
                                    const hoursCount = dailySessions.reduce((sum, s) => sum + (s.hours || 0), 0);
                                    summaryText = `${hoursCount.toFixed(1)} שעות`;
                                }
                                }

                                // For hourly/global, we want to show the rate regardless of sessions
                                if (emp.employee_type === 'hourly' || emp.employee_type === 'global') {
                                    displayRate = getRateForDate(emp.id, day);
                                }


                                return (
                                    <TableCell 
                                        key={emp.id} 
                                        className="text-center cursor-pointer hover:bg-blue-50 transition-colors p-2"
                                        onClick={() => setEditingCell({ day, employee: emp, existingSessions: dailySessions })}
                                    >
                                        <div className="font-semibold text-sm">{summaryText}</div>
                                        
                                        {/* Display rate ONLY if it's > 0 and summary is not '-' (meaning there's activity) OR if the user is hovering/editing */}
                                        {displayRate > 0 && emp.employee_type === 'hourly' && (
                                        <div className="text-xs text-slate-500">@{displayRate.toFixed(2)}₪</div>
                                        )}
                                        {displayRate > 0 && emp.employee_type === 'global' && summaryText !== '-' && (
                                        <div className="text-xs text-slate-500">₪{displayRate.toLocaleString()} לחודש</div>
                                        )}

                                        {summaryPayment > 0 && (
                                        <div className="text-xs text-green-700">₪{summaryPayment.toLocaleString()}</div>
                                        )}
                                    </TableCell>
                                );
                            })}
                            </TableRow>
                        ))}
                        </TableBody>
                    </Table>
                </div>
        </CardContent>
        </Card>

        {/* The Dialog for editing/adding entries */}
        <Dialog open={!!editingCell} onOpenChange={(isOpen) => !isOpen && setEditingCell(null)}>
        <DialogContent className="max-w-3xl">
            <DialogHeader>
            <DialogTitle>
                רישום עבור: {editingCell?.employee.name} | {editingCell && format(editingCell.day, 'dd/MM/yyyy', { locale: he })}
            </DialogTitle>
            <DialogDescription className="sr-only">
              הזן או ערוך את פרטי שעות העבודה או המפגשים עבור היום הנבחר.
            </DialogDescription>
            </DialogHeader>
            {editingCell && (
            <TimeEntryForm
                employee={editingCell.employee}
                services={services}
                initialRows={editingCell.existingSessions}
                selectedDate={editingCell.day}
                getRateForDate={getRateForDate}
                onSubmit={(updatedRows) => {
                    onTableSubmit({
                    employee: editingCell.employee,
                    day: editingCell.day,
                    updatedRows,
                    existingSessions: editingCell.existingSessions,
                    });
                    setEditingCell(null);
                }}
            />
            )}
        </DialogContent>
        </Dialog>
    </>
    );
}
