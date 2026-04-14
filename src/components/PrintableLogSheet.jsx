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
  // Filter out requests that were never issued to keep the log clean, 
  // or keep them all depending on your preference.
  const issuedRequests = requests.filter(r => r.issued_time || r.status === 'ISSUED' || r.status === 'RETURNED');

  return (
    <div className="bg-white p-8 w-full max-w-[1000px] mx-auto text-black font-serif" id="printable-area">
      
      {/* HEADER SECTION */}
      <div className="flex items-center justify-between border-b-2 border-blue-900 pb-4 mb-4">
        {/* Replace src with your actual university logo paths */}
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
      <table className="w-full border-collapse border border-black text-[11px] font-sans">
        <thead>
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
        <tbody>
          {issuedRequests.map((req) => {
            const items = req.items || [];
            const rowSpan = items.length || 1;
            const isComplied = checkComplied(req.created_at, req.issued_time);

            return items.map((item, index) => (
              <tr key={`${req.id}-${index}`}>
                {/* Only render these cells on the FIRST item of the request, and span them down */}
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
            ));
          })}
        </tbody>
      </table>

    </div>
  );
}