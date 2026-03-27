// src/components/shared/ScheduleWidget.jsx
import React, { useState, useEffect } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import enUS from 'date-fns/locale/en-US';
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import api from '../../api/axiosClient';
import NeumorphCard from '../ui/NeumorphCard';

// MUST import the default calendar CSS for it to render correctly
import 'react-big-calendar/lib/css/react-big-calendar.css';

// Setup date-fns localizer for the calendar
const locales = { 'en-US': enUS };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

export default function ScheduleWidget({ roomId }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!roomId) {
      setEvents([]);
      return;
    }
    
    const fetchEvents = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/requests/calendar?room_id=${roomId}`);
        
        // Convert string dates from DB back into real JavaScript Date objects
        const formattedEvents = (res.data.data || []).map(ev => ({
          ...ev,
          start: new Date(ev.start),
          end: new Date(ev.end)
        }));
        
        setEvents(formattedEvents);
      } catch (error) {
        console.error("Failed to fetch calendar events", error);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [roomId]);

  // Color-code the events based on status
  const eventStyleGetter = (event) => {
    let backgroundColor = '#3b82f6'; // Blue (Pending)
    if (event.status === 'APPROVED') backgroundColor = '#10b981'; // Green
    if (event.status === 'ISSUED') backgroundColor = '#8b5cf6'; // Violet
    
    return {
      style: {
        backgroundColor,
        borderRadius: '8px',
        opacity: 0.9,
        color: 'white',
        border: 'none',
        display: 'block',
        fontSize: '11px',
        fontWeight: 'bold',
        padding: '2px 6px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }
    };
  };

  if (!roomId) {
    return (
      <NeumorphCard className="p-6 flex flex-col items-center justify-center h-[350px] text-muted opacity-60">
        <CalendarIcon size={48} className="mb-4 opacity-20" />
        <p className="text-sm font-medium">Select a department room to view its schedule</p>
      </NeumorphCard>
    );
  }

  return (
    <NeumorphCard className="p-4 h-[350px] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-1.5">
          <CalendarIcon size={14} /> Room Schedule
        </h3>
        {loading && <Loader2 size={14} className="animate-spin text-muted" />}
      </div>
      
      {/* Customizing the calendar wrapper so it fits perfectly in the Neumorph design 
        without taking up massive amounts of vertical space.
      */}
      <div className="flex-1 w-full bg-white/50 rounded-xl overflow-hidden [&_.rbc-toolbar]:mb-2 [&_.rbc-toolbar]:text-xs [&_.rbc-btn-group_button]:!text-xs [&_.rbc-btn-group_button]:!py-1 [&_.rbc-header]:!py-2 [&_.rbc-header]:!text-[10px] [&_.rbc-header]:!font-bold [&_.rbc-header]:!uppercase [&_.rbc-header]:!tracking-wider">
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          views={['week', 'day', 'agenda']}
          defaultView="week"
          eventPropGetter={eventStyleGetter}
          tooltipAccessor={(event) => `${event.title} (${event.status})`}
          style={{ height: '100%' }}
        />
      </div>
    </NeumorphCard>
  );
}