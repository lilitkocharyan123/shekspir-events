import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { supabase } from './lib/supabaseClient'
import type {
  AttendedEventInsert,
  AttendeeRecord,
  EventRecord,
  PrinterConfig,
  SearchFields,
} from './types'
import { buildBadgeZpl } from './utils/zpl'

const blankSearch: SearchFields = {
  id: '',
  first_name: '',
  last_name: '',
  phone: '',
  email: '',
  company: '',
}

const printerStorageKey = 'shekspir/printer-config'

const envPrinterDefaults: PrinterConfig = {
  serviceUrl:
    import.meta.env.VITE_PRINTER_SERVICE_URL ?? 'http://localhost:3002/print',
  printerIp: import.meta.env.VITE_PRINTER_IP ?? '',
}

type Notification = {
  type: 'success' | 'error' | 'info'
  message: string
}

function App() {
  const [events, setEvents] = useState<EventRecord[]>([])
  const [selectedEventId, setSelectedEventId] = useState('')
  const [searchFields, setSearchFields] = useState<SearchFields>(blankSearch)
  const [attendees, setAttendees] = useState<AttendeeRecord[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isFetchingEvents, setIsFetchingEvents] = useState(false)
  const [notification, setNotification] = useState<Notification | null>(null)
  const [printerConfig, setPrinterConfig] = useState<PrinterConfig>(() => {
    if (typeof window === 'undefined') return envPrinterDefaults
    try {
      const cached = window.localStorage.getItem(printerStorageKey)
      if (cached) return { ...envPrinterDefaults, ...JSON.parse(cached) }
    } catch {
      // ignore JSON issues
    }
    return envPrinterDefaults
  })
  const [activePrintId, setActivePrintId] = useState<string | null>(null)

  const supabaseReady = Boolean(supabase)

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      printerStorageKey,
      JSON.stringify(printerConfig),
    )
  }, [printerConfig])

  useEffect(() => {
    if (!supabase) return
    const client = supabase

    const loadEvents = async () => {
      setIsFetchingEvents(true)
      const { data, error } = await client
        .from('events')
        .select('id,name,date,created_at')
        .order('date', { ascending: true })

      if (error) {
        setNotification({
          type: 'error',
          message: `Could not load events: ${error.message}`,
        })
      } else {
        setEvents(data ?? [])
      }
      setIsFetchingEvents(false)
    }

    loadEvents()
  }, [])

  useEffect(() => {
    if (!notification) return
    const timeout = setTimeout(() => setNotification(null), 6000)
    return () => clearTimeout(timeout)
  }, [notification])

  const selectedEvent = useMemo(() => {
    const numericId = Number(selectedEventId)
    if (Number.isNaN(numericId)) return undefined
    return events.find((event) => event.id === numericId)
  }, [events, selectedEventId])

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const updateSearchField = (field: keyof SearchFields, value: string) => {
    setSearchFields((prev) => ({ ...prev, [field]: value }))
  }

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    if (!supabase) return

    searchTimeoutRef.current = setTimeout(async () => {
      const client = supabase
      const hasFilters = Object.values(searchFields).some(
        (fieldValue) => fieldValue.trim().length > 0,
      )

      if (!hasFilters) {
        setAttendees([])
        return
      }

      setIsSearching(true)
      let query = client.from('attendee').select('*').limit(50)

      Object.entries(searchFields).forEach(([field, value]) => {
        if (!value.trim()) return
        if (field === 'id') {
          query = query.eq(field, value.trim())
        } else {
          query = query.ilike(field, `%${value.trim()}%`)
        }
      })

      const { data, error } = await query
      if (error) {
        setNotification({
          type: 'error',
          message: `Search failed: ${error.message}`,
        })
      } else {
        setAttendees(data ?? [])
        if ((data ?? []).length === 0) {
          setNotification({
            type: 'info',
            message: 'No attendees matched your search.',
          })
        }
      }
      setIsSearching(false)
    }, 300)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchFields, supabase])

  const handleReset = () => {
    setSearchFields(blankSearch)
    setAttendees([])
  }

  const sendToPrinter = async (labelPayload: string) => {
    if (!printerConfig.serviceUrl) {
      throw new Error('Set a printer service URL before printing.')
    }
    if (!printerConfig.printerIp) {
      throw new Error('Set a printer IP before printing.')
    }

    const response = await fetch(printerConfig.serviceUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        zpl: labelPayload,
        printerIp: printerConfig.printerIp,
      }),
    })

    if (!response.ok) {
      throw new Error(`Printer responded with ${response.statusText}`)
    }
  }

  const handlePrint = async (attendee: AttendeeRecord) => {
    if (!supabase) {
      setNotification({
        type: 'error',
        message: 'Supabase credentials missing. Update your environment file.',
      })
      return
    }
    const client = supabase

    if (!selectedEventId) {
      setNotification({
        type: 'info',
        message: 'Select an event before printing.',
      })
      return
    }
    const eventIdNumber = Number(selectedEventId)
    if (Number.isNaN(eventIdNumber)) {
      setNotification({
        type: 'error',
        message: 'Selected event identifier is invalid.',
      })
      return
    }

    setActivePrintId(attendee.id)
    const zpl = buildBadgeZpl(attendee, 1, {
      labelWidthDots: 640,
      labelHeightDots: 400,
    })

    try {
      await sendToPrinter(zpl)
      
      // Check if already logged
      const { data: existingRows, error: existingError } = await client
        .from('attended_event')
        .select('id')
        .eq('attended_event', eventIdNumber)
        .eq('attendee', attendee.id)
        .limit(1)

      if (existingError) {
        console.error('Error checking existing attendance:', existingError)
        throw existingError
      }

      const alreadyLogged = Boolean(existingRows && existingRows.length > 0)

      if (!alreadyLogged) {
        const payload: AttendedEventInsert = {
          attended_event: eventIdNumber,
          attendee: attendee.id,
        }
        const { data: insertData, error: insertError } = await client
          .from('attended_event')
          .insert([payload])
          .select()

        if (insertError) {
          console.error('Error inserting attendance record:', insertError)
          throw insertError
        }

        console.log('Successfully inserted attendance record:', insertData)
      } else {
        console.log('Attendance already logged, skipping insert')
      }

      setNotification({
        type: 'success',
        message: alreadyLogged
          ? `Printed badge for ${attendee.first_name} ${attendee.last_name} (already marked attended).`
          : `Printed badge for ${attendee.first_name} ${attendee.last_name}`,
      })
    } catch (err) {
      console.error('Print/attendance error:', err)
      const message =
        err instanceof Error ? err.message : 'Unable to print badge.'
      setNotification({ type: 'error', message })
    } finally {
      setActivePrintId(null)
    }
  }

  const printerUrl = useMemo(() => {
    if (!printerConfig.serviceUrl) return 'Service URL required'
    return printerConfig.serviceUrl
  }, [printerConfig.serviceUrl])

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Shekspir Event Toolkit</p>
          <h1>Attendee search & badge printing</h1>
          <p className="lead">
            Choose an event, locate attendees, print 80x50 labels in ZPL and log
            the visit in Supabase.
          </p>
        </div>
        {!supabaseReady && (
          <div className="alert alert-error">
            Add <code>VITE_SUPABASE_URL</code> and{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> to continue.
          </div>
        )}
        {notification && (
          <div className={`alert alert-${notification.type}`}>
            {notification.message}
          </div>
        )}
      </header>

      <div className="panel-pair">
        <section className="panel panel-compact">
          <div className="panel-header">
            <div>
              <h2>Select event</h2>
              <p>Required for printing and attendance logging.</p>
            </div>
            {isFetchingEvents && <span className="pill">Loading events…</span>}
          </div>
          <select
            className="full-width"
            value={selectedEventId}
            onChange={(event) => setSelectedEventId(event.target.value)}
          >
            <option value="">Choose an event…</option>
            {events.map((event) => (
              <option key={event.id} value={event.id.toString()}>
                {event.name}
              </option>
            ))}
          </select>
          {selectedEvent && (
            <p className="muted">
              {selectedEvent.date
                ? `Scheduled: ${new Date(selectedEvent.date).toLocaleDateString()}`
                : 'Event date TBD'}
            </p>
          )}
        </section>

        <section className="panel panel-compact">
          <div className="panel-header">
            <div>
              <h2>Printer service</h2>
            </div>
            <span className="muted">Target: {printerUrl}</span>
          </div>
          <label>
            Service URL
            <input
              value={printerConfig.serviceUrl}
              onChange={(event) =>
                setPrinterConfig((prev) => ({
                  ...prev,
                  serviceUrl: event.target.value,
                }))
              }
              placeholder="http://localhost:3002/print"
            />
          </label>
          <label>
            Printer IP
            <input
              value={printerConfig.printerIp}
              onChange={(event) =>
                setPrinterConfig((prev) => ({
                  ...prev,
                  printerIp: event.target.value,
                }))
              }
              placeholder="192.168.55.222"
            />
          </label>
          <p className="muted small">
            Make sure the bridge service is reachable from this device; the URL
            shown above is where badge print jobs are posted.
          </p>
        </section>
      </div>

      <section className="panel">
        <div className="panel-header">
      <div>
            <h2>Search attendee</h2>
            <p>All fields are optional, use any combination for lookup.</p>
          </div>
        </div>
        <div className="search-form">
          <div className="grid grid-3">
            <label>
              ID
              <input
                value={searchFields.id}
                onChange={(event) => updateSearchField('id', event.target.value)}
                placeholder="Internal ID"
              />
            </label>
            <label>
              First name
              <input
                value={searchFields.first_name}
                onChange={(event) =>
                  updateSearchField('first_name', event.target.value)
                }
                placeholder="Jane"
              />
            </label>
            <label>
              Last name
              <input
                value={searchFields.last_name}
                onChange={(event) =>
                  updateSearchField('last_name', event.target.value)
                }
                placeholder="Doe"
              />
            </label>
          </div>
          <div className="grid grid-3">
            <label>
              Phone
              <input
                value={searchFields.phone}
                onChange={(event) =>
                  updateSearchField('phone', event.target.value)
                }
                placeholder="+1 555 1234"
              />
            </label>
            <label>
              Email
              <input
                value={searchFields.email}
                onChange={(event) =>
                  updateSearchField('email', event.target.value)
                }
                placeholder="user@company.com"
              />
            </label>
            <label>
              Company
              <input
                value={searchFields.company}
                onChange={(event) =>
                  updateSearchField('company', event.target.value)
                }
                placeholder="Shekspir"
              />
            </label>
          </div>
          <div className="actions">
            {isSearching && <span className="pill">Searching…</span>}
            <button
              type="button"
              className="secondary"
              onClick={handleReset}
              disabled={isSearching}
            >
              Reset
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Results</h2>
            <p>
              {attendees.length
                ? `${attendees.length} attendee(s)`
                : 'Run a search to list attendees.'}
        </p>
      </div>
        </div>
        <div className="results">
          {!attendees.length && (
            <p className="muted">No attendees to show yet.</p>
          )}
          {attendees.map((attendee) => (
            <article className="attendee-card" key={attendee.id}>
              <div>
                <h3>
                  {[attendee.first_name, attendee.last_name]
                    .filter(Boolean)
                    .join(' ') || 'Unnamed attendee'}
                </h3>
                <p className="muted">{attendee.company || 'No company set'}</p>
                <dl className="info-grid">
                  <div>
                    <dt>Email</dt>
                    <dd>{attendee.email || '—'}</dd>
                  </div>
                  <div>
                    <dt>Phone</dt>
                    <dd>{attendee.phone || '—'}</dd>
                  </div>
                  <div className="id-block">
                    <dt>Attendee ID</dt>
                    <dd className="mono">{attendee.id}</dd>
                  </div>
                </dl>
              </div>
              <div className="card-actions">
                <button
                  onClick={() => handlePrint(attendee)}
                  disabled={
                    !supabaseReady || !selectedEventId || activePrintId === attendee.id
                  }
                >
                  {activePrintId === attendee.id ? 'Printing…' : 'Print badge'}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

export default App
