import { exportReports } from '../api/reportAPI.js';

/**
 * Trigger Excel export download
 * @param {Object} params - { type, from, to }
 */
export const downloadExcelReport = async (params) => {
  const { data } = await exportReports(params);
  const url = URL.createObjectURL(new Blob([data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `invencea_report_${params.type || 'all'}_${Date.now()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
