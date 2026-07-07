import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

interface Message {
  id: string
  request_id: string
  sender_id: string
  sender_role: string
  thread_participant: string
  body: string
  created_at: string
}

interface Props {
  requestId: string
  /** For tenant/contractor views: which thread to show/send to. Omit for admin (shows both). */
  threadParticipant?: 'tenant' | 'contractor'
  /** Label shown above the thread (e.g. "Messages with Admin") */
  label?: string
  className?: string
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function ThreadPanel({
  requestId,
  threadParticipant,
  label,
  senderRole,
  senderId,
  readOnly,
}: {
  requestId: string
  threadParticipant: 'tenant' | 'contractor'
  label: string
  senderRole: string
  senderId: string
  readOnly: boolean
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let mounted = true

    async function load() {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('request_id', requestId)
        .eq('thread_participant', threadParticipant)
        .order('created_at', { ascending: true })
      if (mounted && data) setMessages(data)
    }
    load()

    const channel = supabase
      .channel(`messages:${requestId}:${threadParticipant}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `request_id=eq.${requestId}`,
        },
        (payload) => {
          const msg = payload.new as Message
          if (msg.thread_participant === threadParticipant) {
            setMessages((prev) => [...prev, msg])
          }
        }
      )
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [requestId, threadParticipant])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    await supabase.from('messages').insert({
      request_id: requestId,
      sender_id: senderId,
      sender_role: senderRole,
      thread_participant: threadParticipant,
      body,
    })
    setDraft('')
    setSending(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
        {label}
      </p>

      {/* Message list */}
      <div
        style={{
          background: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: 10,
          padding: '10px 12px',
          minHeight: 80,
          maxHeight: 240,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {messages.length === 0 && (
          <p style={{ color: '#9ca3af', fontSize: 13, margin: 'auto', textAlign: 'center' }}>No messages yet</p>
        )}
        {messages.map((m) => {
          const isMine = m.sender_id === senderId
          return (
            <div
              key={m.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: isMine ? 'flex-end' : 'flex-start',
              }}
            >
              <div
                style={{
                  background: isMine ? '#1d4ed8' : '#ffffff',
                  color: isMine ? '#ffffff' : '#111827',
                  border: isMine ? 'none' : '1px solid #e5e7eb',
                  borderRadius: isMine ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  padding: '6px 10px',
                  maxWidth: '80%',
                  fontSize: 13,
                  lineHeight: 1.4,
                }}
              >
                {m.body}
              </div>
              <span style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
                {isMine ? 'You' : m.sender_role} · {formatTime(m.created_at)}
              </span>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {!readOnly && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Type a message…"
            style={{
              flex: 1,
              border: '1px solid #d1d5db',
              borderRadius: 8,
              padding: '7px 12px',
              fontSize: 13,
              outline: 'none',
              background: '#fff',
            }}
          />
          <button
            onClick={send}
            disabled={!draft.trim() || sending}
            style={{
              background: draft.trim() ? '#1d4ed8' : '#e5e7eb',
              color: draft.trim() ? '#fff' : '#9ca3af',
              border: 'none',
              borderRadius: 8,
              padding: '0 14px',
              fontSize: 13,
              fontWeight: 600,
              cursor: draft.trim() ? 'pointer' : 'default',
              transition: 'background 0.15s',
            }}
          >
            Send
          </button>
        </div>
      )}
    </div>
  )
}

export default function MessageThread({ requestId, threadParticipant, label, className }: Props) {
  const { user } = useAuth()
  if (!user) return null

  const role = user.role as string
  const isAdmin = role === 'admin' || role === 'master admin'

  // Admin sees both threads (read-only label, can reply in each)
  if (isAdmin) {
    return (
      <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <ThreadPanel
          requestId={requestId}
          threadParticipant="tenant"
          label="Tenant thread"
          senderRole={role}
          senderId={user.id}
          readOnly={false}
        />
        <ThreadPanel
          requestId={requestId}
          threadParticipant="contractor"
          label="Contractor thread"
          senderRole={role}
          senderId={user.id}
          readOnly={false}
        />
      </div>
    )
  }

  // Tenant or contractor sees their own thread only
  const participant = threadParticipant ?? (role === 'tenant' ? 'tenant' : 'contractor')
  const defaultLabel = role === 'tenant' ? 'Messages with admin' : 'Messages with admin'

  return (
    <div className={className}>
      <ThreadPanel
        requestId={requestId}
        threadParticipant={participant as 'tenant' | 'contractor'}
        label={label ?? defaultLabel}
        senderRole={role}
        senderId={user.id}
        readOnly={false}
      />
    </div>
  )
}
