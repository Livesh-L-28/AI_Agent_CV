import React, { useState } from 'react';

interface Zone {
  id: string;
  name: string;
  type: string;
  severity: string;
  points: string;
  requiredPpe: string[];
}

export const ZoneConfig: React.FC = () => {
  const [zones] = useState<Zone[]>([
    {
      id: 'zone-crane-a1',
      name: 'Overhead Crane Danger Zone A-1',
      type: 'RESTRICTED',
      severity: 'CRITICAL',
      points: '[(0.36, 0.24), (0.58, 0.24), (0.58, 0.44), (0.36, 0.44)]',
      requiredPpe: ['HARDHAT', 'SAFETY_VEST'],
    },
    {
      id: 'zone-welding-bay',
      name: 'Robotic Welding Bay 3',
      type: 'RESTRICTED',
      severity: 'HIGH',
      points: '[(0.20, 0.20), (0.60, 0.20), (0.60, 0.60), (0.20, 0.60)]',
      requiredPpe: ['HARDHAT', 'GOGGLES'],
    },
    {
      id: 'zone-walkway-north',
      name: 'Pedestrian Safe Walkway North',
      type: 'SAFE_WALKWAY',
      severity: 'INFO',
      points: '[(0.05, 0.05), (0.95, 0.05), (0.95, 0.18), (0.05, 0.18)]',
      requiredPpe: [],
    },
  ]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>OSHA Spatial Zone Management</h3>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            All coordinates normalized in unit space [0.0, 1.0] for resolution-invariant camera evaluation.
          </p>
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Zone ID</th>
              <th>Zone Name</th>
              <th>Zone Classification</th>
              <th>Configured Severity</th>
              <th>Required PPE</th>
              <th>Normalized Coordinates</th>
            </tr>
          </thead>
          <tbody>
            {zones.map((z) => (
              <tr key={z.id}>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{z.id}</td>
                <td style={{ fontWeight: 500 }}>{z.name}</td>
                <td>
                  <span className={`badge ${z.type === 'RESTRICTED' ? 'badge-danger' : 'badge-info'}`}>
                    {z.type}
                  </span>
                </td>
                <td>
                  <span className={`badge badge-${z.severity.toLowerCase()}`}>
                    {z.severity}
                  </span>
                </td>
                <td>
                  {z.requiredPpe.length > 0 ? (
                    z.requiredPpe.map((ppe) => (
                      <span key={ppe} className="badge badge-warning" style={{ marginRight: 4 }}>
                        {ppe}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>None (Safe)</span>
                  )}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent-cyan)' }}>
                  {z.points}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
