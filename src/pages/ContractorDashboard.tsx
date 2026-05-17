import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { initials } from '../lib/utils'
import DashShell from '../components/DashShell'
import SettingsPage from './SettingsPage'
import { IconWrench, IconCalendar, IconGear } from '../components/icons'

const TABS = [
  { id: 'jobs',     label: 'Jobs',     icon: <IconWrench /> },
  { id: 'schedule', label: 'Schedule', icon: <IconCalendar /> },
  { id: 'settings', label: 'Settings', icon: <IconGear /> },
]

const mockJobs = [
  { id: '1', title: 'Leaking bathroom tap', address: '23 Union Place, 2F, Dundee', priority: 'Medium', status: 'In Progress', date: new Date(Date.now() - 2 * 86400000), tenant: 'Sarah Thomson' },
  { id: '2', title: 'Boiler service', address: '14 Hillside Crescent, Dundee', priority: 'Low', status: 'Open', date: new Date(Date.now() + 3 * 86400000), tenant: 'James Murray' },
  { id: '3', title: 'Electrical fault in kitchen', address: '7 Paton Street, Dundee', priority: 'High', status: 'Open', date: new Date(Date.now() + 1 * 86400000), tenant: 'Emma Wilson' },
]

function priorityStyle(p: string) {
  switch (p) {
    case 'High': case 'Emergency': return { bg: 'rgba(248,113,113,0.15)', color: '#f87171' }
    case 'Medium': return { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24' }
    default: return { bg: 'rgba(74,222,128,0.12)', color: '#4ade80' }
  }
}

function statusStyle(s: string) {
  if (s === 'In Progress') return { bg: 'rgba(96,165,250,0.15)', color: '#60a5fa' }
  if (s === 'Open') return { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24' }
  return { bg: 'rgba(74,222,128,0.12)', color: '#4ade80' }
}

const CARD: React.CSSProperties = { background: '#112240', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12 }

import type React from 'react'

export default function ContractorDashboard() {
  const { user } = useAuth()
  const [tab, setTab] = useState('jobs')
  const userInitials = initials(user?.full_name, user?.email ?? '')

  const inProgress = mockJobs.filter((j) => j.status === 'In Progress').length
  const open = mockJobs.filter((j) => j.status === 'Open').length

  const metrics = [
    { label: 'In Progress', value: String(inProgress) },
    { label: 'Open', value: String(open) },
    { label: 'Completed', value: '0' },
  ]

  return (
    <DashShell tabs={TABS} active={tab} onChange={setTab} metrics={metrics} userInitials={userInitials}>

      {tab === 'jobs' && (
        <div className="px-4 py-5 flex flex-col gap-4">

          {/* Stat strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            {[
              { label: 'In Progress', value: inProgress, color: '#60a5fa' },
              { label: 'Open', value: open, color: '#fbbf24' },
              { label: 'Completed', value: 0, color: '#4ade80' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ ...CARD, padding: '12px 14px', textAlign: 'center' }}>
                <p style={{ fontSize: 26, fontWeight: 300, color, lineHeight: 1, fontFamily: 'Georgia, serif' }}>{value}</p>
                <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', marginTop: 5 }}>{label}</p>
              </div>
            ))}
          </div>

          {/* Jobs */}
          {mockJobs.map((job) => {
            const ps = priorityStyle(job.priority)
            const ss = statusStyle(job.status)
            return (
              <div key={job.id} style={CARD}>
                <div style={{ padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, color: '#e8edf5', fontFamily: 'Georgia, serif' }} className="truncate">{job.title}</p>
                      <p style={{ fontSize: 12, color: '#8899aa', marginTop: 2 }} className="truncate">{job.address}</p>
                      <p style={{ fontSize: 11, color: '#8899aa', marginTop: 2 }}>Tenant: {job.tenant}</p>
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase',
                      padding: '3px 10px', borderRadius: 4,
                      background: ps.bg, color: ps.color, flexShrink: 0,
                    }}>
                      {job.priority}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 500, padding: '3px 10px', borderRadius: 4,
                      background: ss.bg, color: ss.color, letterSpacing: '0.08em', textTransform: 'uppercase',
                    }}>
                      {job.status}
                    </span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {job.status !== 'In Progress' && (
                        <button type="button" style={{
                          fontSize: 11, fontWeight: 500, padding: '5px 12px', borderRadius: 6,
                          background: 'rgba(255,255,255,0.06)', color: '#e8edf5',
                          border: '1px solid rgba(255,255,255,0.1)',
                        }}>Start</button>
                      )}
                      <button type="button" style={{
                        fontSize: 11, fontWeight: 500, padding: '5px 12px', borderRadius: 6,
                        background: 'rgba(74,222,128,0.15)', color: '#4ade80',
                        border: '1px solid rgba(74,222,128,0.2)',
                      }}>Complete</button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'schedule' && (
        <div className="px-4 py-5 flex flex-col gap-3">
          {mockJobs
            .sort((a, b) => a.date.getTime() - b.date.getTime())
            .map((job) => {
              const ps = priorityStyle(job.priority)
              return (
                <div key={job.id} style={{ ...CARD, padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 8, flexShrink: 0,
                    background: 'rgba(255,255,255,0.06)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <p style={{ fontSize: 9, letterSpacing: '0.1em', color: '#8899aa' }}>
                      {job.date.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()}
                    </p>
                    <p style={{ fontSize: 20, fontWeight: 300, color: '#e8edf5', lineHeight: 1.1, fontFamily: 'Georgia, serif' }}>{job.date.getDate()}</p>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 500, color: '#e8edf5' }} className="truncate">{job.title}</p>
                    <p style={{ fontSize: 12, color: '#8899aa' }} className="truncate">{job.address}</p>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 500, padding: '3px 10px', borderRadius: 4,
                    background: ps.bg, color: ps.color, flexShrink: 0,
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                  }}>
                    {job.priority}
                  </span>
                </div>
              )
            })}
        </div>
      )}

      {tab === 'settings' && <SettingsPage />}
    </DashShell>
  )
}
