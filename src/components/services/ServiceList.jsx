import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Edit, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const PAYMENT_MODELS = {
  fixed_rate: 'תעריף קבוע',
  per_student: 'תעריף לתלמיד'
};

export default function ServiceList({ services, onEdit, isLoading }) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Settings className="w-12 h-12 mx-auto text-slate-300 mb-4" />
          <h3 className="text-xl font-semibold">לא נמצאו שירותים</h3>
          <p className="text-slate-500">התחל על ידי הוספת שירות חדש.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-lg">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>שם השירות</TableHead>
              <TableHead>משך (דקות)</TableHead>
              <TableHead>מודל תשלום</TableHead>
              <TableHead className="text-left">פעולות</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.map((service) => (
              <TableRow key={service.id}>
                <TableCell className="font-medium">{service.name}</TableCell>
                <TableCell>{service.duration_minutes || '-'}</TableCell>
                <TableCell>
                  <Badge variant="outline">{PAYMENT_MODELS[service.payment_model]}</Badge>
                </TableCell>
                <TableCell className="text-left">
                  <Button variant="ghost" size="sm" onClick={() => onEdit(service)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}