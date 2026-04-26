import React from 'react';

// Helper functions for date and time formatting
const formatDate = (dateString) => {
  if (!dateString) return '';
  const d = new Date(dateString);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '/');
};

const formatTime = (dateString) => {
  if (!dateString) return '';
  const d = new Date(dateString);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false });
};

// Logic to check if it was issued within 15 minutes
const checkComplied = (reqTime, issTime) => {
  if (!reqTime || !issTime) return false;
  const diffMins = (new Date(issTime).getTime() - new Date(reqTime).getTime()) / 60000;
  return diffMins <= 15;
};

export default function PrintableLogSheet({ requests, targetMonth = "March 2026" }) {
  const issuedRequests = requests.filter(r => r.issued_time || r.status === 'ISSUED' || r.status === 'RETURNED');

  return (
    <>
      <style type="text/css" media="print">
        {`
          @page {
            size: A4 portrait;
            margin: 6mm 10mm;
          }

          /* 1. NUKE ALL DASHBOARD LAYOUT CONSTRAINTS */
          html, body, #root, [id^="root"] * {
            display: block !important;
            position: static !important;
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            overflow: visible !important;
            margin: 0 !important;
            padding: 0 !important;
            background-color: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* 2. HIDE EVERYTHING — collapse height so siblings don't push content down */
          body * {
            visibility: hidden;
            height: 0 !important;
            min-height: 0 !important;
            overflow: hidden !important;
          }

          #printable-area, #printable-area * {
            visibility: visible;
            height: auto !important;
            min-height: unset !important;
            overflow: visible !important;
          }

          /* 3. ⚡ KEY FIX: Use position:static so the browser can flow content
             across multiple A4 pages. position:absolute pinned content to page 1
             and clipped everything that didn't fit. */
          #printable-area {
            position: static !important;
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
          }

          /* 4. BULLETPROOF TABLE PAGINATION RULES */
          table {
            width: 100% !important;
            border-collapse: collapse !important;
            page-break-inside: auto !important;
            page-break-after: auto !important;
          }

          /* Force column headers to repeat on every new page */
          thead {
            display: table-header-group !important;
          }

          /* Allow tbody to flow across pages */
          tbody {
            display: table-row-group !important;
            page-break-inside: auto !important;
          }

          /* CRITICAL: Never break a page IN THE MIDDLE of a table row */
          tr {
            page-break-inside: avoid !important;
            page-break-after: auto !important;
          }

          /* Ensure table cells don't try to flex or hide overflow */
          td, th {
            page-break-inside: avoid !important;
            overflow: visible !important;
            word-wrap: break-word !important;
          }
        `}
      </style>

      <div 
        id="printable-area" 
        className="bg-white p-8 w-full max-w-[1000px] mx-auto text-black font-serif print:p-0 print:w-full print:max-w-none"
      >
        
        {/* HEADER SECTION */}
        <div className="flex items-center justify-between border-b-2 border-blue-900 pb-4 mb-4">
          <img src="/csu-logo.png" alt="CSU Logo" className="w-16 h-16 object-contain" />
          
          <div className="text-center flex-1">
            <h1 className="font-bold text-lg leading-tight uppercase">Catanduanes State University</h1>
            <h2 className="text-sm font-semibold leading-tight uppercase">College of Engineering and Architecture</h2>
            <p className="text-xs italic">Virac, Catanduanes</p>
          </div>

          <div className="flex gap-2">
            <img src="/bagong-pilipinas.png" alt="Bagong Pilipinas" className="w-12 h-12 object-contain" />
            <img src="/iso-logo.png" alt="ISO Logo" className="w-12 h-12 object-contain" />
          </div>
        </div>

        {/* METADATA SECTION */}
        <div className="text-xs mb-4 space-y-1 font-sans">
          <div className="flex">
            <span className="font-bold w-16">MFO:</span>
            <span>Issuance of Laboratory Apparatuses/Instruments</span>
          </div>
          <div className="flex">
            <span className="font-bold w-16">Target:</span>
            <span>80% of Faculty and Students requests for available Laboratory Instruments issued within 15 minutes upon request</span>
          </div>
          <div className="flex">
            <span className="font-bold w-16">Month:</span>
            <span>{targetMonth}</span>
          </div>
        </div>

        {/* TABLE SECTION */}
        <table className="w-full border-collapse border border-black text-xs font-sans">
          <thead className="table-header-group">
            <tr>
              <th rowSpan={2} className="border border-black p-1.5 text-center font-bold w-[20%]">Name</th>
              <th rowSpan={2} className="border border-black p-1.5 text-center font-bold w-[30%]">Item</th>
              <th colSpan={2} className="border border-black p-1 text-center font-bold">Requested</th>
              <th colSpan={2} className="border border-black p-1 text-center font-bold">Issued</th>
              <th colSpan={2} className="border border-black p-1 text-center font-bold">Status</th>
            </tr>
            <tr>
              <th className="border border-black p-1 text-center font-bold w-[8%]">Date</th>
              <th className="border border-black p-1 text-center font-bold w-[7%]">Time</th>
              <th className="border border-black p-1 text-center font-bold w-[8%]">Date</th>
              <th className="border border-black p-1 text-center font-bold w-[7%]">Time</th>
              <th className="border border-black p-1 text-center font-bold w-[10%]">Complied</th>
              <th className="border border-black p-1 text-center font-bold w-[10%]">Not Complied</th>
            </tr>
          </thead>

          {issuedRequests.map((req) => {
            const items = req.items || [];
            const rowSpan = items.length || 1;
            const isComplied = checkComplied(req.created_at, req.issued_time);

            return (
              <tbody key={req.id} className="border-b border-black">
                {items.map((item, index) => (
                  <tr key={`${req.id}-${index}`}>
                    {index === 0 && (
                      <td rowSpan={rowSpan} className="border border-black p-1.5 align-middle">
                        {req.requester_name}
                      </td>
                    )}
                    
                    <td className="border border-black p-1.5">
                      {item.item_name} {item.quantity > 1 ? `(x${item.quantity})` : ''}
                    </td>

                    {index === 0 && (
                      <>
                        <td rowSpan={rowSpan} className="border border-black p-1.5 text-center align-middle">
                          {formatDate(req.created_at)}
                        </td>
                        <td rowSpan={rowSpan} className="border border-black p-1.5 text-center align-middle">
                          {formatTime(req.created_at)}
                        </td>
                        <td rowSpan={rowSpan} className="border border-black p-1.5 text-center align-middle">
                          {formatDate(req.issued_time)}
                        </td>
                        <td rowSpan={rowSpan} className="border border-black p-1.5 text-center align-middle">
                          {formatTime(req.issued_time)}
                        </td>
                        <td rowSpan={rowSpan} className="border border-black p-1.5 text-center align-middle font-bold text-sm">
                          {isComplied ? '✓' : ''}
                        </td>
                        <td rowSpan={rowSpan} className="border border-black p-1.5 text-center align-middle font-bold text-sm">
                          {!isComplied ? '✓' : ''}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            );
          })}
        </table>
      </div>
    </>
  );
}