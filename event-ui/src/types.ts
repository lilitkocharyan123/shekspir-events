export type SearchFields = string;

export type PrinterConfig = {
  serviceUrl: string;
  printerIp: string;
};

export type EventRecord = {
  id: number;
  name: string;
  date: string | null;
  created_at?: string;
};

export type AttendeeRecord = {
  id: string;
  first_name: string;
  last_name: string;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
};

export type AttendedEventInsert = {
  attended_event: number;
  attendee: string;
};
