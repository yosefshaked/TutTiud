import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import he from '@/i18n/he.json';

export default function ConfirmPermanentDeleteModal({ isOpen, onClose, onConfirm, summary = null, summaryText = '' }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setValue('');
      setError('');
      setSubmitting(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  const handleClose = () => {
    if (!submitting) onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (value.trim() !== 'מחק') return;
    try {
      setSubmitting(true);
      await onConfirm();
      setSubmitting(false);
      onClose();
    } catch (err) {
      setError(err.message || '');
      setSubmitting(false);
    }
  };

  let summaryLine = summaryText || '';
  if (!summaryLine && summary) {
    if (summary.segmentsCount != null) {
      summaryLine = he['delete.summary.day'].replace('{{count}}', String(summary.segmentsCount));
    } else {
      summaryLine = he['delete.summary.global']
        .replace('{{employee}}', summary.employeeName || '')
        .replace('{{date}}', summary.date || '')
        .replace('{{entryType}}', summary.entryTypeLabel || '');
      if (summary.hours != null) summaryLine += ` • שעות ${summary.hours}`;
      if (summary.meetings != null) summaryLine += ` • מפגשים ${summary.meetings}`;
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent role="dialog" aria-modal="true" className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4" dir="rtl">
          <DialogHeader>
            <DialogTitle>{he['delete.title']}</DialogTitle>
            <DialogDescription>{he['delete.subtitle']}</DialogDescription>
          </DialogHeader>
          {summaryLine && <p className="text-sm text-slate-600">{summaryLine}</p>}
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={he['delete.input.placeholder']}
            disabled={submitting}
            aria-label={he['delete.input.placeholder']}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
              {he['delete.cancel']}
            </Button>
            <Button
              type="submit"
              className="bg-red-600 hover:bg-red-700"
              disabled={value.trim() !== 'מחק' || submitting}
            >
              {submitting ? <span className="loader mr-2"></span> : null}
              {he['delete.primary']}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
