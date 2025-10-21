import React from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, Users, Globe } from 'lucide-react';
import { InfoTooltip } from '../InfoTooltip';
import { Skeleton } from '@/components/ui/skeleton';

function formatHours(value) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export default function CombinedHoursCard({ hourly = 0, meeting = 0, global = 0, isLoading }) {
  const total = hourly + meeting + global;
  const metrics = [
    {
      label: 'שעות עובדים שעתיים',
      value: hourly,
      icon: Clock,
      tooltip: 'סכימת שעות עבודה שנרשמו לעובדים שעתיים בטווח הנבחר.'
    },
    {
      label: 'שעות מפגשים (מוערך)',
      value: meeting,
      icon: Users,
      tooltip: 'הערכה לפי משך השירותים שהוזנו לכל מפגש.'
    },
    {
      label: 'שעות עובדים גלובליים',
      value: global,
      icon: Globe,
      tooltip: 'סכימת קטעי שעות שנרשמו לעובדים גלובליים (ללא ימי חופשה בתשלום).'
    }
  ];

  return (
    <Card className="relative overflow-visible bg-white/70 backdrop-blur-sm border-0 shadow-lg">
      <CardHeader className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {metrics.map((m, idx) => (
            <div key={idx} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <m.icon className="w-4 h-4 text-slate-600" />
                <span className="text-sm text-slate-600">{m.label}</span>
                <InfoTooltip text={m.tooltip} />
              </div>
              {isLoading ? (
                <Skeleton className="h-5 w-10" />
              ) : (
                <span className="text-sm font-semibold text-slate-900">{formatHours(m.value)}</span>
              )}
            </div>
          ))}
        </div>
        <div className="border-t my-4" />
        <div className="flex items-center justify-between font-bold text-slate-900">
          <CardTitle className="text-base">סך כל השעות</CardTitle>
          {isLoading ? <Skeleton className="h-6 w-12" /> : <span className="text-lg">{formatHours(total)}</span>}
        </div>
      </CardHeader>
    </Card>
  );
}
