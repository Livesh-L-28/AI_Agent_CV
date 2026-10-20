import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import { fetchIncidents, reviewIncident, Incident } from '../services/api';

export const Incidents: React.FC = () => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [reviewerName, setReviewerName] = useState('Safety Supervisor');
  const [notes, setNotes] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'OPEN' | 'RESOLVED'>('ALL');

  const loadIncidents = async () => {
    try {
      const data = await fetchIncidents();
      setIncidents(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadIncidents();
  }, []);

  const handleReview = async (action: 'RESOLVE' | 'DISMISS' | 'ESCALATE') => {
    if (!selectedIncident) return;
    try {
      await reviewIncident(
        selectedIncident.id,
        action,
        reviewerName,
        notes || `Action taken: ${action}`
      );
      setSelectedIncident(null);
      setNotes('');
      await loadIncidents();
    } catch (e) {
      console.error('Failed to submit review', e);
    }
  };

  const filtered = incidents.filter((inc) => {
    if (filter === 'ALL') return true;
    return inc.status === filter;
  });

  return (
    <div>
      {/* Header filter controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className={`btn ${filter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter('ALL')}
          >
            All Incidents ({incidents.length})
          </button>
          <button
            className={`btn ${filter === 'OPEN' ? 'btn-danger' : 'btn-secondary'}`}
            onClick={() => setFilter('OPEN')}
          >
            Open ({incidents.filter((i) => i.status === 'OPEN').length})
          </button>
          <button
            className={`btn ${filter === 'RESOLVED' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter('RESOLVED')}
          >
            Resolved ({incidents.filter((i) => i.status === 'RESOLVED').length})
          </button>
        </div>
      </div>

      {/* Incidents Table */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Severity</th>
              <th>Title</th>
              <th>Status</th>
              <th>Assigned To</th>
              <th>Timestamp</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                  No incidents found for selected filter.
                </td>
              </tr>
            ) : (
              filtered.map((inc) => (
                <tr key={inc.id}>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{inc.id}</td>
                  <td>
                    <span className={`badge badge-${inc.severity.toLowerCase()}`}>
                      {inc.severity}
                    </span>
                  </td>
                  <td style={{ fontWeight: 500 }}>{inc.title}</td>
                  <td>
                    <span
                      style={{
                        color:
                          inc.status === 'OPEN'
                            ? 'var(--status-danger)'
                            : inc.status === 'RESOLVED'
                            ? 'var(--status-success)'
                            : 'var(--status-warning)',
                      }}
                    >
                      ● {inc.status}
                    </span>
                  </td>
                  <td>{inc.assigned_to || 'Unassigned'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    {new Date(inc.created_at).toLocaleTimeString()}
                  </td>
                  <td>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '4px 10px', fontSize: 12 }}
                      onClick={() => setSelectedIncident(inc)}
                    >
                      Inspect & Review
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Review Modal */}
      {selectedIncident && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(3, 6, 12, 0.8)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 8,
              width: 520,
              padding: 24,
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600 }}>Supervisory Incident Review</h3>
              <button
                onClick={() => setSelectedIncident(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
              <div><strong>Incident:</strong> {selectedIncident.id}</div>
              <div><strong>Title:</strong> {selectedIncident.title}</div>
              <div><strong>Severity:</strong> <span className={`badge badge-${selectedIncident.severity.toLowerCase()}`}>{selectedIncident.severity}</span></div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Reviewer Name</label>
              <input
                type="text"
                value={reviewerName}
                onChange={(e) => setReviewerName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 6,
                  color: '#fff',
                }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Resolution Notes</label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Escort status, disciplinary action, or false alarm rationale..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 6,
                  color: '#fff',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => handleReview('DISMISS')}>
                <XCircle size={14} /> Dismiss False Alarm
              </button>
              <button className="btn btn-primary" onClick={() => handleReview('RESOLVE')}>
                <CheckCircle size={14} /> Confirm & Resolve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
