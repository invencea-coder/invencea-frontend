// Status color mapping
export const statusColor = (status) => {
  const colors = {
    PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    ISSUED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    RETURNED: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
    EXPIRED: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
  };
  return colors[status] || 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
};

// Status icon mapping (for use with Lucide icons)
import { Clock, CheckCircle, Package, RotateCcw, XCircle, FileText } from 'lucide-react';

export const statusIcon = (status) => {
  switch (status) {
    case 'PENDING': return Clock;
    case 'APPROVED': return CheckCircle;
    case 'ISSUED': return Package;
    case 'RETURNED': return RotateCcw;
    case 'REJECTED': return XCircle;
    default: return FileText;
  }
};

// Format currency
export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(amount);
};

// Format number with commas
export const formatNumber = (num) => {
  return new Intl.NumberFormat().format(num);
};

// Truncate text
export const truncate = (text, length = 50) => {
  if (!text) return '';
  return text.length > length ? text.substring(0, length) + '...' : text;
};