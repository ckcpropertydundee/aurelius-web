import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

type ListedProperty = {
  id: string
  address: string
  postcode: string | null
  city: string | null
  property_type: string | null
  bedrooms: number | null
  monthly_rent: number | null
  description: string | null
  photo_urls: string[]
  listing_headline: string | null
  available_from: string | null
  landlord_registration_number: string | null
}

function fmtAvailable(dateStr: string | null): string {
  if (!dateStr) return 'Available now'
  const d = new Date(dateStr)
  if (d <= new Date()) return 'Available now'
  return `Available ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
}

function buildCalDays(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1)
  const total = new Date(year, month + 1, 0).getDate()
  const startPad = (first.getDay() + 6) % 7 // shift so Mon = 0
  const days: (Date | null)[] = Array(startPad).fill(null)
  for (let d = 1; d <= total; d++) days.push(new Date(year, month, d))
  while (days.length % 7 !== 0) days.push(null)
  return days
}

type BookingState = 'idle' | 'form' | 'submitting' | 'success' | 'error'

const TIME_SLOTS = [
  '9:00 am', '9:30 am', '10:00 am', '10:30 am', '11:00 am', '11:30 am',
  '12:00 pm', '12:30 pm', '1:00 pm', '1:30 pm', '2:00 pm', '2:30 pm',
  '3:00 pm', '3:30 pm', '4:00 pm', '4:30 pm', '5:00 pm',
]

const INPUT: React.CSSProperties = {
  width: '100%', padding: '11px 12px', borderRadius: 8, fontSize: 14,
  background: '#0a192f', border: '1px solid rgba(255,255,255,0.12)',
  color: '#e8edf5', outline: 'none', boxSizing: 'border-box',
}

const NAV_LINKS = [
  { label: 'Tenant Experience', href: 'https://aureliuspropertymanagement.co.uk' },
  { label: 'Properties to Let', href: '/for-let', active: true },
  { label: 'Automation Engine', href: 'https://aureliuspropertymanagement.co.uk/automation-engine.html' },
  { label: 'Investor Lens', href: 'https://aureliuspropertymanagement.co.uk/investor-lens.html' },
  { label: 'The Control Panel', href: 'https://aureliuspropertymanagement.co.uk/control-panel.html' },
  { label: 'The Manifesto', href: 'https://aureliuspropertymanagement.co.uk/manifesto.html' },
]

type SortOption = 'available' | 'price-asc' | 'price-desc' | 'beds-asc' | 'beds-desc'
type Layout = 'list' | 'grid' | 'compact'

export default function PropertiesForLetPage() {
  const [properties, setProperties] = useState<ListedProperty[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<ListedProperty | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const [layout, setLayout] = useState<Layout>('list')
  const [sortBy, setSortBy] = useState<SortOption>('available')
  const [filterBeds, setFilterBeds] = useState<number | null>(null)
  const [filterMaxRent, setFilterMaxRent] = useState<number>(3000)
  const [showFilters, setShowFilters] = useState(false)

  const [bookingState, setBookingState] = useState<BookingState>('idle')
  const [bookingName, setBookingName] = useState('')
  const [bookingEmail, setBookingEmail] = useState('')
  const [bookingPhone, setBookingPhone] = useState('')
  const [bookingDate, setBookingDate] = useState('')
  const [bookingTime, setBookingTime] = useState('')
  const [bookingMessage, setBookingMessage] = useState('')
  const [bookingError, setBookingError] = useState<string | null>(null)
  const [calOpen, setCalOpen] = useState(false)
  const [calMonth, setCalMonth] = useState<Date>(() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d })
  const calRef = useRef<HTMLDivElement>(null)

  function resetBooking() {
    setBookingState('idle')
    setBookingName(''); setBookingEmail(''); setBookingPhone('')
    setBookingDate(''); setBookingTime(''); setBookingMessage('')
    setBookingError(null); setCalOpen(false)
    const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); setCalMonth(d)
  }

  async function submitBooking(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    setBookingState('submitting')
    setBookingError(null)
    const { error } = await supabase.from('viewing_requests').insert({
      property_id:     selected.id,
      name:            bookingName.trim(),
      email:           bookingEmail.trim().toLowerCase(),
      phone:           bookingPhone.trim() || null,
      preferred_date:  bookingDate,
      preferred_time:  bookingTime,
      message:         bookingMessage.trim() || null,
      status:          'pending',
    })
    if (error) {
      setBookingError('Something went wrong — please try again or email us directly.')
      setBookingState('error')
    } else {
      setBookingState('success')
      supabase.functions.invoke('send-viewing-email', {
        body: {
          type: 'received',
          viewing: {
            name: bookingName.trim(),
            email: bookingEmail.trim().toLowerCase(),
            address: selected.address,
            date: bookingDate,
            time: bookingTime,
          },
        },
      })
    }
  }

  useEffect(() => {
    supabase
      .from('properties')
      .select('id, address, postcode, city, property_type, bedrooms, monthly_rent, description, photo_urls, listing_headline, available_from, landlord_registration_number')
      .eq('is_listed', true)
      .order('available_from', { ascending: true, nullsFirst: true })
      .then(({ data }) => {
        setProperties((data ?? []) as ListedProperty[])
        setLoading(false)
      })
  }, [])

  return (
    <div style={{ minHeight: '100dvh', background: '#F7F6F3', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontWeight: 300 }}>

      {/* Nav */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
        background: 'rgba(13,27,62,0.97)', backdropFilter: 'blur(12px)',
        borderBottom: '0.5px solid rgba(255,255,255,0.08)',
        padding: '0 clamp(16px, 2.5vw, 32px)', height: 70,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <a href="https://aureliuspropertymanagement.co.uk" style={{ textDecoration: 'none' }}>
          <span style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(11px, 1vw, 13px)', letterSpacing: 'clamp(5px, 0.6vw, 9px)', color: '#fff', textTransform: 'uppercase' }}>
            Aurelius
          </span>
        </a>

        {/* Desktop links */}
        <ul style={{ display: 'flex', flex: 1, justifyContent: 'space-evenly', listStyle: 'none', margin: 0, padding: 0 }}
            className="nav-links-desktop">
          {NAV_LINKS.map(link => (
            <li key={link.label}>
              <a
                href={link.href}
                style={{
                  display: 'block', padding: '8px 6px',
                  fontSize: 'clamp(7.5px, 1vw, 11px)', letterSpacing: 'clamp(0.5px, 0.15vw, 2px)',
                  textTransform: 'uppercase', textDecoration: 'none',
                  color: link.active ? '#fff' : 'rgba(255,255,255,0.5)',
                  borderBottom: link.active ? '1px solid rgba(255,255,255,0.3)' : 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <a
          href="https://login.aureliuspropertymanagement.co.uk"
          className="nav-login-btn"
          style={{
            display: 'inline-flex', alignItems: 'center',
            padding: 'clamp(4px, 0.5vw, 7px) clamp(8px, 1.2vw, 16px)',
            fontSize: 'clamp(7.5px, 0.75vw, 10px)', letterSpacing: 'clamp(0.5px, 0.15vw, 2px)',
            textTransform: 'uppercase', color: '#fff', textDecoration: 'none',
            border: '0.5px solid rgba(255,255,255,0.35)', flexShrink: 0,
          }}
        >
          Log in
        </a>

        {/* Hamburger */}
        <button
          onClick={() => setMenuOpen(o => !o)}
          className="hamburger-btn"
          aria-label="Menu"
          style={{ display: 'none', flexDirection: 'column', gap: 5, background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}
        >
          <span style={{ display: 'block', width: 22, height: 1.5, background: '#fff' }} />
          <span style={{ display: 'block', width: 22, height: 1.5, background: '#fff' }} />
          <span style={{ display: 'block', width: 22, height: 1.5, background: '#fff' }} />
        </button>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <div style={{
          position: 'fixed', top: 70, left: 0, right: 0, zIndex: 999,
          background: 'rgba(13,27,62,0.98)', backdropFilter: 'blur(12px)',
          padding: '16px 24px 24px', display: 'flex', flexDirection: 'column',
        }}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {NAV_LINKS.map(link => (
              <li key={link.label}>
                <a
                  href={link.href}
                  style={{
                    display: 'block', padding: '14px 0',
                    fontSize: 12, letterSpacing: 2, textTransform: 'uppercase',
                    color: link.active ? '#fff' : 'rgba(255,255,255,0.65)',
                    textDecoration: 'none',
                    borderBottom: '0.5px solid rgba(255,255,255,0.08)',
                  }}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <a
            href="https://login.aureliuspropertymanagement.co.uk"
            style={{
              display: 'inline-flex', marginTop: 20, padding: '12px 24px',
              fontSize: 11, letterSpacing: 2, textTransform: 'uppercase',
              color: '#fff', textDecoration: 'none',
              border: '0.5px solid rgba(255,255,255,0.35)', alignSelf: 'flex-start',
            }}
          >
            Log in
          </a>
        </div>
      )}

      {/* Responsive styles */}
      <style>{`
        @media (max-width: 900px) {
          .nav-links-desktop { display: none !important; }
          .nav-login-btn { display: none !important; }
          .hamburger-btn { display: flex !important; }
        }
      `}</style>

      {/* Page content */}
      <div style={{ paddingTop: 70 }}>

        {/* Sort / Filter / Layout toolbar */}
        {!loading && (
          <div style={{ borderBottom: '0.5px solid #E8E6E1', background: '#fff' }}>
            <div style={{ maxWidth: 800, margin: '0 auto', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>

              {/* Sort */}
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SortOption)}
                style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', padding: '7px 10px', border: '0.5px solid #E8E6E1', background: '#F7F6F3', color: '#0D1B3E', cursor: 'pointer', outline: 'none', appearance: 'none' }}
              >
                <option value="available">Sort: Availability</option>
                <option value="price-asc">Sort: Price ↑</option>
                <option value="price-desc">Sort: Price ↓</option>
                <option value="beds-asc">Sort: Beds ↑</option>
                <option value="beds-desc">Sort: Beds ↓</option>
              </select>

              {/* Filter toggle */}
              <button
                type="button"
                onClick={() => setShowFilters(f => !f)}
                style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', padding: '7px 12px', border: `0.5px solid ${showFilters ? '#0D1B3E' : '#E8E6E1'}`, background: showFilters ? '#0D1B3E' : '#F7F6F3', color: showFilters ? '#fff' : '#0D1B3E', cursor: 'pointer' }}
              >
                Filter {(filterBeds !== null || filterMaxRent < 3000) ? '·' : ''}
              </button>

              {/* Spacer */}
              <div style={{ flex: 1 }} />

              {/* Layout buttons */}
              {(['list', 'grid', 'compact'] as Layout[]).map(l => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLayout(l)}
                  title={l.charAt(0).toUpperCase() + l.slice(1)}
                  style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `0.5px solid ${layout === l ? '#0D1B3E' : '#E8E6E1'}`, background: layout === l ? '#0D1B3E' : '#F7F6F3', cursor: 'pointer', color: layout === l ? '#fff' : '#4A5878' }}
                >
                  {l === 'list' && (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                      <rect x="0" y="1" width="14" height="2"/><rect x="0" y="6" width="14" height="2"/><rect x="0" y="11" width="14" height="2"/>
                    </svg>
                  )}
                  {l === 'grid' && (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                      <rect x="0" y="0" width="6" height="6"/><rect x="8" y="0" width="6" height="6"/><rect x="0" y="8" width="6" height="6"/><rect x="8" y="8" width="6" height="6"/>
                    </svg>
                  )}
                  {l === 'compact' && (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                      <rect x="0" y="0" width="14" height="1.5"/><rect x="0" y="4" width="14" height="1.5"/><rect x="0" y="8" width="14" height="1.5"/><rect x="0" y="12" width="14" height="1.5"/>
                    </svg>
                  )}
                </button>
              ))}
            </div>

            {/* Filter panel */}
            {showFilters && (
              <div style={{ maxWidth: 800, margin: '0 auto', padding: '12px 16px 16px', borderTop: '0.5px solid #E8E6E1', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: '#C8C5BE' }}>Bedrooms</span>
                  {[null, 1, 2, 3, 4].map(b => (
                    <button
                      key={b ?? 'any'}
                      type="button"
                      onClick={() => setFilterBeds(b)}
                      style={{ fontSize: 10, padding: '5px 10px', border: `0.5px solid ${filterBeds === b ? '#0D1B3E' : '#E8E6E1'}`, background: filterBeds === b ? '#0D1B3E' : '#F7F6F3', color: filterBeds === b ? '#fff' : '#4A5878', cursor: 'pointer' }}
                    >
                      {b === null ? 'Any' : b === 4 ? '4+' : b}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200, flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: '#C8C5BE' }}>Max Rent</span>
                    <span style={{ fontSize: 11, fontFamily: 'Georgia, serif', color: '#0D1B3E' }}>
                      {filterMaxRent >= 3000 ? 'No limit' : `£${filterMaxRent}/mo`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={Math.min(...properties.map(p => p.monthly_rent ?? 3000), 3000)}
                    max={3000}
                    step={5}
                    value={filterMaxRent}
                    onChange={e => setFilterMaxRent(Number(e.target.value))}
                    style={{ width: '100%', accentColor: '#0D1B3E', cursor: 'pointer' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 9, color: '#C8C5BE' }}>£{Math.min(...properties.map(p => p.monthly_rent ?? 3000), 3000)}</span>
                    <span style={{ fontSize: 9, color: '#C8C5BE' }}>£3,000</span>
                  </div>
                </div>
                {(filterBeds !== null || filterMaxRent < 3000) && (
                  <button
                    type="button"
                    onClick={() => { setFilterBeds(null); setFilterMaxRent(3000) }}
                    style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: '#C8C5BE', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Property list */}
        {(() => {
          const filtered = properties
            .filter(p => filterBeds === null || (filterBeds === 4 ? (p.bedrooms ?? 0) >= 4 : p.bedrooms === filterBeds))
            .filter(p => filterMaxRent >= 3000 || (p.monthly_rent ?? Infinity) <= filterMaxRent)
            .sort((a, b) => {
              if (sortBy === 'price-asc') return (a.monthly_rent ?? 0) - (b.monthly_rent ?? 0)
              if (sortBy === 'price-desc') return (b.monthly_rent ?? 0) - (a.monthly_rent ?? 0)
              if (sortBy === 'beds-asc') return (a.bedrooms ?? 0) - (b.bedrooms ?? 0)
              if (sortBy === 'beds-desc') return (b.bedrooms ?? 0) - (a.bedrooms ?? 0)
              const da = a.available_from ? new Date(a.available_from).getTime() : 0
              const db = b.available_from ? new Date(b.available_from).getTime() : 0
              return da - db
            })

          const isGrid = layout === 'grid'
          const isCompact = layout === 'compact'

          return (
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px 60px' }}>
          <div style={{ display: isGrid ? 'grid' : 'flex', gridTemplateColumns: isGrid ? '1fr 1fr' : undefined, flexDirection: isGrid ? undefined : 'column', gap: isCompact ? 8 : 16 }}>
          {loading ? (
            <>{[1,2,3].map(i => <div key={i} style={{ background: '#e8e6e1', borderRadius: 14, height: 240, opacity: 0.4 }} />)}</>
          ) : filtered.length === 0 ? (
            <div style={{ background: '#fff', border: '0.5px solid #E8E6E1', borderRadius: 14, padding: '48px 24px', textAlign: 'center', gridColumn: '1 / -1' }}>
              <p style={{ fontFamily: 'Georgia, serif', fontSize: 18, color: '#0D1B3E', marginBottom: 8 }}>
                {properties.length === 0 ? 'No properties currently listed.' : 'No properties match your filters.'}
              </p>
              {properties.length === 0 && (
                <p style={{ fontSize: 13, color: '#4A5878', marginTop: 8 }}>
                  Contact us at <a href="mailto:aureliuspropertymanagement@gmail.com" style={{ color: '#0D1B3E' }}>aureliuspropertymanagement@gmail.com</a> to register your interest.
                </p>
              )}
            </div>
          ) : filtered.map(p => isCompact ? (
            /* Compact row */
            <div
              key={p.id}
              onClick={() => { setSelected(p); resetBooking() }}
              style={{ background: '#fff', border: '0.5px solid #E8E6E1', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
            >
              {p.photo_urls?.length > 0 ? (
                <img src={p.photo_urls[0]} alt={p.address} style={{ width: 56, height: 56, objectFit: 'cover', flexShrink: 0, borderRadius: 4 }} />
              ) : (
                <div style={{ width: 56, height: 56, background: '#F7F6F3', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="rgba(13,27,62,0.15)"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: 'Georgia, serif', fontSize: 14, color: '#0D1B3E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.address}{p.postcode ? ` ${p.postcode}` : ''}
                </p>
                {p.listing_headline && (
                  <p style={{ fontSize: 11, color: '#4A5878', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.listing_headline}
                  </p>
                )}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {p.monthly_rent != null && (
                  <p style={{ fontFamily: 'Georgia, serif', fontSize: 16, color: '#0D1B3E' }}>£{Number(p.monthly_rent)}<span style={{ fontSize: 11, color: '#4A5878' }}>/mo</span></p>
                )}
                <p style={{ fontSize: 10, color: '#065F46', marginTop: 2 }}>{fmtAvailable(p.available_from)}</p>
              </div>
            </div>
          ) : (
            /* Card (list or grid) */
            <div
              key={p.id}
              onClick={() => { setSelected(p); resetBooking() }}
              style={{ background: '#fff', border: '0.5px solid #E8E6E1', borderRadius: 14, overflow: 'hidden', cursor: 'pointer' }}
            >
              {p.photo_urls?.length > 0 ? (
                <div style={{ width: '100%', height: isGrid ? 160 : 220, overflow: 'hidden', position: 'relative' }}>
                  <img src={p.photo_urls[0]} alt={p.address} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  {p.photo_urls.length > 1 && (
                    <span style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 11, padding: '3px 8px', borderRadius: 6 }}>
                      +{p.photo_urls.length - 1} photos
                    </span>
                  )}
                </div>
              ) : (
                <div style={{ width: '100%', height: isGrid ? 120 : 160, background: '#F7F6F3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="rgba(13,27,62,0.15)"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
                </div>
              )}
              <div style={{ padding: isGrid ? '12px 14px' : '16px 20px' }}>
                <p style={{ fontFamily: 'Georgia, serif', fontSize: isGrid ? 15 : 18, color: '#0D1B3E', marginBottom: 4 }}>
                  {p.address}{p.city ? `, ${p.city}` : ''}{p.postcode ? ` ${p.postcode}` : ''}
                </p>
                {p.listing_headline && (
                  <p style={{ fontSize: 12, color: '#4A5878', marginBottom: 10 }}>{p.listing_headline}</p>
                )}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  {p.bedrooms != null && <span style={{ fontSize: 9, padding: '3px 8px', letterSpacing: 1, textTransform: 'uppercase', background: '#F7F6F3', color: '#0D1B3E', border: '0.5px solid #E8E6E1' }}>{p.bedrooms} bed{p.bedrooms !== 1 ? 's' : ''}</span>}
                  {p.property_type && <span style={{ fontSize: 9, padding: '3px 8px', letterSpacing: 1, textTransform: 'uppercase', background: '#F7F6F3', color: '#4A5878', border: '0.5px solid #E8E6E1' }}>{p.property_type}</span>}
                  <span style={{ fontSize: 9, padding: '3px 8px', letterSpacing: 1, textTransform: 'uppercase', background: 'rgba(6,95,70,0.06)', color: '#065F46', border: '0.5px solid rgba(6,95,70,0.2)' }}>{fmtAvailable(p.available_from)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  {p.monthly_rent != null && (
                    <p style={{ fontFamily: 'Georgia, serif', fontSize: isGrid ? 18 : 22, color: '#0D1B3E', fontWeight: 400 }}>
                      £{Number(p.monthly_rent)}<span style={{ fontSize: 12, color: '#4A5878', fontFamily: 'inherit', fontWeight: 400 }}>/mo</span>
                    </p>
                  )}
                  <span style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: '#4A5878' }}>View →</span>
                </div>
                {p.landlord_registration_number && (
                  <p style={{ fontSize: 10, color: '#C8C5BE', marginTop: 8, letterSpacing: '0.04em' }}>Landlord Reg: {p.landlord_registration_number}</p>
                )}
              </div>
            </div>
          ))}
        </div>
        </div>
          )
        })()}

        {/* Footer */}
        <div style={{ borderTop: '0.5px solid #E8E6E1', padding: '48px clamp(24px, 5vw, 64px)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'Georgia, serif', fontSize: 13, letterSpacing: 10, textTransform: 'uppercase', color: '#C8C5BE' }}>Aurelius</span>
          <span style={{ fontSize: 9, letterSpacing: 3, textTransform: 'uppercase', color: '#C8C5BE' }}>Property Management</span>
        </div>
      </div>

      {/* Property detail overlay */}
      {selected && (
        <div id="detail-overlay" style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#F7F6F3', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          {/* Overlay header */}
          <div style={{ position: 'sticky', top: 0, background: 'rgba(13,27,62,0.97)', backdropFilter: 'blur(12px)', borderBottom: '0.5px solid rgba(255,255,255,0.08)', padding: '0 20px', height: 70, display: 'flex', alignItems: 'center', gap: 12, zIndex: 10, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setSelected(null)}
              style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 6, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', flexShrink: 0 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
              </svg>
            </button>
            <p style={{ fontFamily: 'Georgia, serif', fontSize: 15, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {selected.address}{selected.postcode ? ` ${selected.postcode}` : ''}
            </p>
          </div>

          {/* Detail body */}
          <div style={{ maxWidth: 800, margin: '0 auto', width: '100%', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 26, fontWeight: 400, color: '#0D1B3E', marginBottom: 6 }}>
                {selected.address}{selected.city ? `, ${selected.city}` : ''}{selected.postcode ? ` ${selected.postcode}` : ''}
              </h2>
              {selected.listing_headline && (
                <p style={{ fontSize: 13, color: '#4A5878' }}>{selected.listing_headline}</p>
              )}
              {selected.monthly_rent != null && (
                <p style={{ fontFamily: 'Georgia, serif', fontSize: 30, color: '#0D1B3E', fontWeight: 400, marginTop: 10 }}>
                  £{Number(selected.monthly_rent)}
                  <span style={{ fontSize: 14, color: '#4A5878', fontFamily: 'inherit', fontWeight: 400 }}>/month</span>
                </p>
              )}
            </div>

            {/* Photos */}
            {selected.photo_urls?.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: selected.photo_urls.length > 1 ? '1fr 1fr' : '1fr', gap: 2, borderRadius: 12, overflow: 'hidden' }}>
                {selected.photo_urls.slice(0, 4).map((url, i) => (
                  <div key={i} style={{ position: 'relative', paddingTop: selected.photo_urls.length === 1 ? '56%' : '66%' }}>
                    <img src={url} alt={`Photo ${i + 1}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                    {i === 3 && selected.photo_urls.length > 4 && (
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <p style={{ fontSize: 18, color: '#fff', fontWeight: 500 }}>+{selected.photo_urls.length - 4} more</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ borderRadius: 12, overflow: 'hidden', background: '#F0EEE9', height: 220, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, border: '0.5px solid #E8E6E1' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="rgba(13,27,62,0.15)"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
                <p style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: '#C8C5BE' }}>No photos yet</p>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {[
                { label: 'Bedrooms', value: selected.bedrooms != null ? `${selected.bedrooms} bed${selected.bedrooms !== 1 ? 's' : ''}` : '—' },
                { label: 'Type', value: selected.property_type ? selected.property_type.charAt(0).toUpperCase() + selected.property_type.slice(1) : '—' },
                { label: 'Available', value: selected.available_from ? new Date(selected.available_from).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Now' },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: '#fff', border: '0.5px solid #E8E6E1', borderRadius: 10, padding: '12px 10px', textAlign: 'center' }}>
                  <p style={{ fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: '#C8C5BE', marginBottom: 6 }}>{label}</p>
                  <p style={{ fontSize: 14, color: '#0D1B3E', fontFamily: 'Georgia, serif' }}>{value}</p>
                </div>
              ))}
            </div>

            <div style={{ background: '#fff', border: '0.5px solid #E8E6E1', borderRadius: 12, padding: '16px 18px' }}>
              <p style={{ fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: '#C8C5BE', marginBottom: 10 }}>About this property</p>
              <p style={{ fontSize: 14, color: selected.description ? '#4A5878' : '#C8C5BE', lineHeight: 1.7 }}>
                {selected.description ?? 'No description provided.'}
              </p>
            </div>

            {bookingState === 'idle' && (
              <button
                type="button"
                onClick={() => { resetBooking(); setBookingState('form') }}
                style={{ width: '100%', padding: '16px 0', background: '#0D1B3E', color: '#fff', border: 'none', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', cursor: 'pointer' }}
              >
                Request a Viewing
              </button>
            )}

            {(bookingState === 'form' || bookingState === 'submitting' || bookingState === 'error') && (
              <div style={{ background: '#fff', border: '0.5px solid #E8E6E1', borderRadius: 12, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <p style={{ fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: '#C8C5BE' }}>Request a Viewing</p>
                  <button type="button" onClick={resetBooking} style={{ background: 'none', border: 'none', color: '#C8C5BE', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
                </div>
                <form onSubmit={submitBooking} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input required placeholder="Full name *" value={bookingName} onChange={e => setBookingName(e.target.value)} style={{ ...INPUT, background: '#F7F6F3', color: '#0D1B3E', border: '0.5px solid #E8E6E1' }} />
                  <input required type="email" placeholder="Email address *" value={bookingEmail} onChange={e => setBookingEmail(e.target.value)} style={{ ...INPUT, background: '#F7F6F3', color: '#0D1B3E', border: '0.5px solid #E8E6E1' }} />
                  <input type="tel" placeholder="Phone number (optional)" value={bookingPhone} onChange={e => setBookingPhone(e.target.value)} style={{ ...INPUT, background: '#F7F6F3', color: '#0D1B3E', border: '0.5px solid #E8E6E1' }} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div style={{ position: 'relative' }} ref={calRef}>
                      <p style={{ fontSize: 9, color: '#C8C5BE', marginBottom: 4, letterSpacing: 2, textTransform: 'uppercase' }}>Preferred date *</p>
                      <button
                        type="button"
                        onClick={() => setCalOpen(o => !o)}
                        style={{ ...INPUT, background: '#F7F6F3', color: bookingDate ? '#0D1B3E' : '#C8C5BE', border: `0.5px solid ${calOpen ? '#0D1B3E' : '#E8E6E1'}`, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                      >
                        <span style={{ fontSize: 14 }}>
                          {bookingDate ? new Date(bookingDate + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Select date'}
                        </span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0, opacity: 0.4 }}>
                          <path d="M19 4h-1V2h-2v2H8V2H6v2H5C3.9 4 3 4.9 3 6v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5z"/>
                        </svg>
                      </button>
                      {/* Hidden input keeps form validation working */}
                      <input type="text" required readOnly value={bookingDate} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 }} tabIndex={-1} />
                      {calOpen && (() => {
                        const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0)
                        const maxDate = new Date(todayMidnight); maxDate.setMonth(maxDate.getMonth() + 1)
                        const yr = calMonth.getFullYear(); const mo = calMonth.getMonth()
                        const days = buildCalDays(yr, mo)
                        const prevDisabled = new Date(yr, mo, 1) <= new Date(todayMidnight.getFullYear(), todayMidnight.getMonth(), 1)
                        const nextDisabled = new Date(yr, mo + 1, 1) > new Date(maxDate.getFullYear(), maxDate.getMonth(), 1)
                        const monthLabel = new Date(yr, mo).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
                        return (
                          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: '#fff', border: '0.5px solid #E8E6E1', borderRadius: 10, padding: '12px 10px', boxShadow: '0 8px 32px rgba(13,27,62,0.12)', marginTop: 4 }}>
                            {/* Month nav */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                              <button type="button" onClick={() => { const d = new Date(yr, mo - 1, 1); setCalMonth(d) }} disabled={prevDisabled}
                                style={{ width: 28, height: 28, background: 'none', border: '0.5px solid #E8E6E1', borderRadius: 4, cursor: prevDisabled ? 'default' : 'pointer', color: prevDisabled ? '#E8E6E1' : '#0D1B3E', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                ‹
                              </button>
                              <p style={{ fontSize: 11, fontWeight: 600, color: '#0D1B3E', letterSpacing: 1, textTransform: 'uppercase' }}>{monthLabel}</p>
                              <button type="button" onClick={() => { const d = new Date(yr, mo + 1, 1); setCalMonth(d) }} disabled={nextDisabled}
                                style={{ width: 28, height: 28, background: 'none', border: '0.5px solid #E8E6E1', borderRadius: 4, cursor: nextDisabled ? 'default' : 'pointer', color: nextDisabled ? '#E8E6E1' : '#0D1B3E', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                ›
                              </button>
                            </div>
                            {/* Day headers */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
                              {['Mo','Tu','We','Th','Fr','Sa','Su'].map(d => (
                                <div key={d} style={{ textAlign: 'center', fontSize: 9, color: '#C8C5BE', letterSpacing: 1, paddingBottom: 4, fontWeight: 600 }}>{d}</div>
                              ))}
                            </div>
                            {/* Day grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                              {days.map((day, i) => {
                                if (!day) return <div key={i} />
                                const iso = day.toISOString().slice(0, 10)
                                const isPast = day < todayMidnight
                                const isBeyond = day > maxDate
                                const isDisabled = isPast || isBeyond
                                const isSelected = iso === bookingDate
                                const isToday = iso === todayMidnight.toISOString().slice(0, 10)
                                return (
                                  <button key={i} type="button" disabled={isDisabled}
                                    onClick={() => { setBookingDate(iso); setCalOpen(false) }}
                                    style={{
                                      height: 30, borderRadius: 4, border: isToday && !isSelected ? '0.5px solid #0D1B3E' : 'none',
                                      background: isSelected ? '#0D1B3E' : 'transparent',
                                      color: isDisabled ? '#E8E6E1' : isSelected ? '#fff' : '#0D1B3E',
                                      fontSize: 12, cursor: isDisabled ? 'default' : 'pointer', fontWeight: isToday ? 600 : 400,
                                    }}>
                                    {day.getDate()}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                    <div>
                      <p style={{ fontSize: 9, color: '#C8C5BE', marginBottom: 4, letterSpacing: 2, textTransform: 'uppercase' }}>Preferred time *</p>
                      <select required value={bookingTime} onChange={e => setBookingTime(e.target.value)} style={{ ...INPUT, background: '#F7F6F3', color: '#0D1B3E', border: '0.5px solid #E8E6E1', appearance: 'none' }}>
                        <option value="">Select time</option>
                        {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  <textarea placeholder="Any questions or notes? (optional)" value={bookingMessage} onChange={e => setBookingMessage(e.target.value)} rows={3} style={{ ...INPUT, background: '#F7F6F3', color: '#0D1B3E', border: '0.5px solid #E8E6E1', resize: 'vertical', fontFamily: 'inherit' }} />
                  {bookingError && <p style={{ fontSize: 12, color: '#dc2626' }}>{bookingError}</p>}
                  <button type="submit" disabled={bookingState === 'submitting'} style={{ padding: '14px 0', background: bookingState === 'submitting' ? '#C8C5BE' : '#0D1B3E', color: '#fff', border: 'none', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', cursor: bookingState === 'submitting' ? 'default' : 'pointer' }}>
                    {bookingState === 'submitting' ? 'Sending…' : 'Send Request'}
                  </button>
                </form>
              </div>
            )}

            {bookingState === 'success' && (
              <div style={{ background: 'rgba(6,95,70,0.05)', border: '0.5px solid rgba(6,95,70,0.2)', borderRadius: 12, padding: '28px 20px', textAlign: 'center' }}>
                <p style={{ fontFamily: 'Georgia, serif', fontSize: 20, color: '#065F46', marginBottom: 8 }}>Request sent.</p>
                <p style={{ fontSize: 13, color: '#4A5878', lineHeight: 1.6 }}>
                  We'll be in touch to confirm your viewing at <strong style={{ color: '#0D1B3E' }}>{selected.address}</strong>.
                </p>
                <button type="button" onClick={resetBooking} style={{ marginTop: 16, fontSize: 11, letterSpacing: 1, color: '#C8C5BE', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                  Submit another request
                </button>
              </div>
            )}

            <p style={{ fontSize: 12, color: '#C8C5BE', textAlign: 'center' }}>
              Or email us at <a href="mailto:aureliuspropertymanagement@gmail.com" style={{ color: '#4A5878' }}>aureliuspropertymanagement@gmail.com</a>
            </p>

            {/* Similar properties carousel */}
            {(() => {
              const similar = properties
                .filter(p => p.id !== selected.id)
                .map(p => {
                  let score = 0
                  if (selected.bedrooms != null && p.bedrooms === selected.bedrooms) score += 3
                  else if (selected.bedrooms != null && p.bedrooms != null && Math.abs(p.bedrooms - selected.bedrooms) === 1) score += 1
                  if (selected.monthly_rent != null && p.monthly_rent != null) {
                    const diff = Math.abs(p.monthly_rent - selected.monthly_rent) / selected.monthly_rent
                    if (diff <= 0.15) score += 3
                    else if (diff <= 0.30) score += 1
                  }
                  return { ...p, score }
                })
                .filter(p => p.score > 0)
                .sort((a, b) => b.score - a.score)
                .slice(0, 6)

              if (similar.length === 0) return null

              return (
                <div style={{ borderTop: '0.5px solid #E8E6E1', paddingTop: 20 }}>
                  <p style={{ fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: '#C8C5BE', marginBottom: 14 }}>Similar Properties</p>
                  <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' } as React.CSSProperties}>
                    {similar.map(p => (
                      <div
                        key={p.id}
                        onClick={() => {
                          setSelected(p)
                          resetBooking()
                          document.getElementById('detail-overlay')?.scrollTo({ top: 0, behavior: 'smooth' })
                        }}
                        style={{ flexShrink: 0, width: 190, background: '#fff', border: '0.5px solid #E8E6E1', borderRadius: 12, overflow: 'hidden', cursor: 'pointer' }}
                      >
                        {p.photo_urls?.length > 0 ? (
                          <img src={p.photo_urls[0]} alt={p.address} style={{ width: '100%', height: 110, objectFit: 'cover', display: 'block' }} />
                        ) : (
                          <div style={{ width: '100%', height: 110, background: '#F0EEE9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="rgba(13,27,62,0.15)"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
                          </div>
                        )}
                        <div style={{ padding: '10px 12px' }}>
                          <p style={{ fontFamily: 'Georgia, serif', fontSize: 13, color: '#0D1B3E', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.address}
                          </p>
                          <p style={{ fontSize: 11, color: '#4A5878', marginBottom: 6 }}>
                            {p.bedrooms != null ? `${p.bedrooms} bed` : ''}{p.property_type ? ` · ${p.property_type.charAt(0).toUpperCase() + p.property_type.slice(1)}` : ''}
                          </p>
                          {p.monthly_rent != null && (
                            <p style={{ fontFamily: 'Georgia, serif', fontSize: 15, color: '#0D1B3E' }}>
                              £{Number(p.monthly_rent)}<span style={{ fontSize: 10, color: '#4A5878' }}>/mo</span>
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            {selected.landlord_registration_number && (
              <div style={{ borderTop: '0.5px solid #E8E6E1', paddingTop: 14, textAlign: 'center' }}>
                <p style={{ fontSize: 11, color: '#C8C5BE', letterSpacing: '0.04em' }}>
                  Landlord Registration No: <span style={{ color: '#4A5878' }}>{selected.landlord_registration_number}</span>
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
