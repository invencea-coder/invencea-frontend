import { format, parseISO } from 'date-fns';

export const fmtDate = (d) => {
  if (!d) return '—';
  try { return format(parseISO(d), 'MMM d, yyyy'); } catch { return d; }
};

export const fmtDateTime = (d) => {
  if (!d) return '—';
  try { return format(parseISO(d), 'MMM d, yyyy h:mm a'); } catch { return d; }
};

export const fmtTime = (d) => {
  if (!d) return '—';
  try { return format(parseISO(d), 'h:mm a'); } catch { return d; }
};

export const todayISO = () => format(new Date(), 'yyyy-MM-dd');

export const isSameDay = (dateStr) => {
  if (!dateStr) return false;
  return dateStr.startsWith(format(new Date(), 'yyyy-MM-dd'));
};
