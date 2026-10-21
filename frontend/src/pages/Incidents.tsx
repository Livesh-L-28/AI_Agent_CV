import React, { useEffect, useState } from 'react';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Download,
  FileText,
  Shield,
  RefreshCw,
} from 'lucide-react';
import {
  fetchIncidents,
  reviewIncident,
  fetchIncidentEvidence,
  downloadIncidentEvidence,
  Incident,
  EvidenceAsset,
  getCurrentUser,
} from '../services/api';
import { StatusBadge } from '../components/StatusBadge';
import { FilterBar, FilterOption } from '../components/FilterBar';
import { Drawer } from '../components/Drawer';
import { EmptyState } from '../components/EmptyState';
import { SkeletonLoader } from '../components/SkeletonLoader';

export const Incidents: React.FC = () => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [evidenceAssets, setEvidenceAssets] = useState<EvidenceAsset[]>([]);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [reviewerName, setReviewerName] = useState('');
  const [notes, setNotes] = useState('');
  const [filter, setFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [submittingReview, setSubmittingReview] = useState(false);

  const currentUser = getCurrentUser();
  const isAuthorizedToReview = currentUser.role === 'safety_officer' || currentUser.role === 'admin';

  const loadIncidents = async () => {
    try {
      setLoading(true);
      const data = await fetchIncidents();
      setIncidents(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load incidents', e);
      setIncidents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIncidents();
    setReviewerName(currentUser.username || 'safety_officer');
  }, []);

  const handleOpenIncident = async (inc: Incident) => {
    setSelectedIncident(inc);
    setNotes('');
    setReviewError(null);
    try {
      setLoadingEvidence(true);
      const assets = await fetchIncidentEvidence(inc.id);
      setEvidenceAssets(assets);
    } catch (e) {
      console.warn('Failed to load evidence assets', e);
      setEvidenceAssets([]);
    } finally {
      setLoadingEvidence(false);
    }
  };

  const handleDownloadAsset = async (asset: EvidenceAsset) => {
    if (!selectedIncident) return;
    try {
      const blob = await downloadIncidentEvidence(selectedIncident.id, asset.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `incident_${selectedIncident.id}_${asset.id}.jpg`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e: any) {
      alert(`Evidence download failed: ${e.message || 'Integrity check error'}`);
    }
  };

  const handleReview = async (action: 'RESOLVE' | 'DISMISS' | 'ESCALATE') => {
    if (!selectedIncident) return;
    try {
      setSubmittingReview(true);
      setReviewError(null);
      await reviewIncident(
        selectedIncident.id,
        action,
        reviewerName || currentUser.username,
        notes || `Supervisory action: ${action}`
      );
      setSelectedIncident(null);
      setNotes('');
      await loadIncidents();
    } catch (e: any) {
      setReviewError(e.message || 'Failed to submit review');
    } finally {
      setSubmittingReview(false);
    }
  };

  const incidentList = Array.isArray(incidents) ? incidents : [];

  const filterOptions: FilterOption[] = [
    { id: 'ALL', label: 'All Incidents', count: incidentList.length },
    { id: 'OPEN', label: 'Open', count: incidentList.filter((i) => i.status === 'OPEN').length },
    { id: 'RESOLVED', label: 'Resolved', count: incidentList.filter((i) => i.status === 'RESOLVED').length },
    { id: 'CRITICAL', label: 'Critical', count: incidentList.filter((i) => i.severity === 'CRITICAL').length },
  ];

  const filtered = incidentList.filter((inc) => {
    const matchesFilter =
      filter === 'ALL'
        ? true
        : filter === 'CRITICAL'
        ? inc.severity === 'CRITICAL'
        : inc.status === filter;

    const matchesSearch =
      !searchQuery ||
      inc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inc.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inc.assigned_to && inc.assigned_to.toLowerCase().includes(searchQuery.toLowerCase())) ||
      inc.event_id.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  return (
    <div>
      {/* Enterprise Filter Bar */}
      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search incidents by ID, title, or reviewer..."
        filterOptions={filterOptions}
        activeFilter={filter}
        onFilterChange={setFilter}
        actions={
          <button
            className="btn btn-secondary"
            onClick={loadIncidents}
            style={{ padding: '7px 12px', fontSize: 12 }}
            title="Refresh Incident Queue"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        }
      />

      {/* Incidents Table */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th scope="col">Incident ID</th>
              <th scope="col">Severity</th>
              <th scope="col">Title & Summary</th>
              <th scope="col">Status</th>
              <th scope="col">Assigned To</th>
              <th scope="col">Created Timestamp</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && incidents.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 24 }}>
                  <SkeletonLoader variant="row" count={4} />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 0 }}>
                  <EmptyState
                    title="No Incidents Found"
                    description={
                      searchQuery
                        ? `No incidents matched query "${searchQuery}". Clear search or change filters.`
                        : 'No safety breaches recorded in this filter view.'
                    }
                  />
                </td>
              </tr>
            ) : (
              filtered.map((inc) => (
                <tr key={inc.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>
                    {inc.id}
                  </td>
                  <td>
                    <StatusBadge status={inc.severity} size="sm" />
                  </td>
                  <td style={{ fontWeight: 500 }}>
                    <div>{inc.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                      Event: {inc.event_id}
                    </div>
                  </td>
                  <td>
                    <StatusBadge status={inc.status} size="sm" showIcon={false} />
                  </td>
                  <td>
                    <span style={{ fontSize: 12, color: inc.assigned_to ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      {inc.assigned_to || 'Unassigned'}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-secondary)' }}>
                    {new Date(inc.created_at).toLocaleString()}
                  </td>
                  <td>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '4px 10px', fontSize: 11 }}
                      onClick={() => handleOpenIncident(inc)}
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

      {/* Comprehensive Incident Investigation Drawer */}
      {selectedIncident && (
        <Drawer
          isOpen={Boolean(selectedIncident)}
          onClose={() => setSelectedIncident(null)}
          title={`Incident Investigation: ${selectedIncident.id}`}
          subtitle={`Recorded on ${new Date(selectedIncident.created_at).toLocaleString()}`}
          width={580}
        >
          {/* Severity & Status Pill Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              marginBottom: 20,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <StatusBadge status={selectedIncident.severity} />
              <StatusBadge status={selectedIncident.status} showIcon={false} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              Provenance: <strong>DETERMINISTIC GATE</strong>
            </div>
          </div>

          {/* Incident Details Card */}
          <div style={{ marginBottom: 20 }}>
            <h4 style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: 0.6, marginBottom: 8 }}>
              Incident Title
            </h4>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
              {selectedIncident.title}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 16 }}>
              <span>Event Reference: <code style={{ color: 'var(--accent-cyan)' }}>{selectedIncident.event_id}</code></span>
              <span>Assigned Reviewer: <strong>{selectedIncident.assigned_to || 'Pending Assignment'}</strong></span>
            </div>
            {selectedIncident.resolution_notes && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle)', borderRadius: 6, fontSize: 12.5 }}>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: 11, marginBottom: 3 }}>Supervisory Notes:</span>
                {selectedIncident.resolution_notes}
              </div>
            )}
          </div>

          {/* Evidence Assets Section */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <h4 style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: 0.6 }}>
                Verified Evidence Assets ({evidenceAssets.length})
              </h4>
              <span style={{ fontSize: 11, color: 'var(--accent-cyan)' }}>SHA-256 Verifiable</span>
            </div>

            {loadingEvidence ? (
              <SkeletonLoader variant="card" />
            ) : evidenceAssets.length === 0 ? (
              <div style={{ padding: '14px 16px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-subtle)', borderRadius: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                No separate binary evidence snapshots linked to this incident record.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {evidenceAssets.map((asset) => (
                  <div
                    key={asset.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-card)',
                      borderRadius: 6,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <FileText size={18} color="var(--accent-cyan)" />
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-primary)' }}>
                          {asset.asset_type} ({Math.round(asset.byte_size / 1024)} KB)
                        </div>
                        <div style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: 2 }}>
                          SHA-256: {asset.sha256_hash.slice(0, 16)}...
                        </div>
                      </div>
                    </div>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '4px 10px', fontSize: 11 }}
                      onClick={() => handleDownloadAsset(asset)}
                    >
                      <Download size={12} /> Download
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Supervisory Review Action Form */}
          <div
            style={{
              padding: '18px',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-card)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Shield size={16} color="var(--accent-cyan)" />
              <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                Human Supervisory Decision
              </h4>
            </div>

            {!isAuthorizedToReview && (
              <div style={{ padding: '8px 12px', background: 'rgba(245, 158, 11, 0.15)', border: '1px solid var(--status-warning)', borderRadius: 6, color: 'var(--status-warning)', fontSize: 12, marginBottom: 14 }}>
                Read-only mode: Only users with <strong>Safety Officer</strong> or <strong>Admin</strong> role can confirm resolutions or dismiss incidents.
              </div>
            )}

            {reviewError && (
              <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid var(--status-danger)', borderRadius: 6, color: 'var(--status-danger)', fontSize: 12, marginBottom: 14 }}>
                {reviewError}
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Reviewer Identity
              </label>
              <input
                type="text"
                value={reviewerName}
                onChange={(e) => setReviewerName(e.target.value)}
                disabled={!isAuthorizedToReview || submittingReview}
                style={{
                  width: '100%',
                  padding: '7px 12px',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 6,
                  color: 'var(--text-primary)',
                  fontSize: 12.5,
                }}
              />
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Resolution or Escalation Notes
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={!isAuthorizedToReview || submittingReview}
                placeholder="Document safety corrective action, personnel escort, or false alarm rationale..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 6,
                  color: 'var(--text-primary)',
                  fontSize: 12.5,
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                className="btn btn-secondary"
                disabled={!isAuthorizedToReview || submittingReview}
                onClick={() => handleReview('DISMISS')}
                style={{ fontSize: 12 }}
              >
                <XCircle size={14} /> Dismiss False Alarm
              </button>
              <button
                className="btn btn-secondary"
                disabled={!isAuthorizedToReview || submittingReview}
                onClick={() => handleReview('ESCALATE')}
                style={{ fontSize: 12, color: 'var(--status-warning)' }}
              >
                <AlertTriangle size={14} /> Escalate
              </button>
              <button
                className="btn btn-primary"
                disabled={!isAuthorizedToReview || submittingReview}
                onClick={() => handleReview('RESOLVE')}
                style={{ fontSize: 12 }}
              >
                <CheckCircle size={14} /> {submittingReview ? 'Submitting...' : 'Confirm & Resolve'}
              </button>
            </div>
          </div>
        </Drawer>
      )}
    </div>
  );
};
